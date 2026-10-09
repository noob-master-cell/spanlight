# 9. Recoverable secrets are encrypted with an application master key

Date: 2026-10-08 · Status: accepted

## Context

Spanlight stores two kinds of secrets. Passwords and API keys are only ever compared, so they are stored as one-way hashes (argon2id, SHA-256) and cannot be recovered. Other secrets have to be read back in clear text: a two-factor (TOTP) seed, to compute the expected code; a provider credential, to call the provider on the user's behalf; and later the signing secrets of notification channels and the client secrets of single sign-on providers.

These must not sit in the database as plain text. Backups are `pg_dump` files that leave the server, and a restored dump, a leaked backup or a read-only SQL injection should not hand over every customer's credentials. Postgres' own encryption functions would pass the key through SQL, where it can show up in statement logs and `pg_stat_statements`, so the encryption has to happen in the application.

## Decision

Seal each secret in the application with **AES-256-GCM** (the `cryptography` package) under a master key that lives in the environment, never in the database.

- **Nonce.** Every encryption draws a fresh random 96-bit nonce from the operating system. The stored value is the nonce, then the ciphertext and its 128-bit authentication tag, in one `bytea`.
- **Key id as associated data.** The id of the key that sealed the value is authenticated with it. Editing the `key_id` column of a row so it names another key makes decryption fail instead of being silently accepted.
- **Keyring.** `CREDENTIALS_KEYS` holds `<key_id>:<base64 of 32 bytes>`, optionally several separated by commas. The **first entry seals new data**; every entry can open data sealed under its id. A key id is 1 to 64 letters, digits, `.`, `_` or `-`. A malformed value (bad base64, a key that is not 32 bytes, a duplicate id) stops the process at startup, and the error never repeats the value.
- **Optional.** With no keys configured, the features that need to store a secret report that encryption is not configured. Nothing falls back to storing plain text.

Generate a key with `openssl rand -base64 32` and prefix it with an id, for example `v1:` followed by the output.

## Consequences

- **A lost key cannot be recovered.** Every secret sealed under it becomes unreadable, and users have to enrol their second factor and re-enter their credentials again. Keep an offline copy of the keyring, stored apart from the database backups; a backup kept next to the key it protects adds nothing.
- **A leaked key exposes every secret sealed under it** to anyone who also has a copy of the database. Treat `CREDENTIALS_KEYS` like `SECRET_KEY`: set it as a secret in the deployment, never commit it.
- **Nonce limit.** With random 96-bit nonces, NIST SP 800-38D caps a single key at about 2^32 (four billion) encryptions before a repeated nonce becomes a realistic risk. A deployment seals one value per enrolled user or configured credential, many orders of magnitude below that. If this ever stops being true, the keyring already supports moving to a new key.
- **Rotation.** Put a new entry first and keep the old ones: `v2:<new key>,v1:<old key>`. New data is sealed under `v2`, old data still opens under `v1`. Every service that opens data (the api and the worker) needs the new key before any service seals with it, so first append the new entry after the old one, deploy, then move it to the front. Never remove a key that still seals data: those rows fail with an unknown-key error. `spanlight reseal-credentials` re-seals provider credentials under the first key (see below); two-factor seeds have no such command yet, so a key that sealed any of them stays in the keyring.
- **Scope.** This protects data at rest in the database and its backups. It does not protect against someone who controls the running application, because the process holds the key in memory.

## Provider credentials

A provider credential (an organization's API key for OpenAI, Anthropic or an OpenAI-compatible server) is stored as the sealed bytes in `provider_credentials.ciphertext` and the id of the key that sealed them in `provider_credentials.key_id`. The clear key arrives once, in the body of the request that adds or rotates the credential, and is never returned by the API, written to the audit log or logged; log lines name the credential by id.

- **Without `CREDENTIALS_KEYS`** adding or rotating a credential answers `409 NOT_CONFIGURED`. Nothing is stored.
- **Rotating a credential** (`POST .../credentials/{id}/rotate`) replaces the provider key and seals the new one under the current first key. This is the user replacing their provider key, not the operator replacing the master key.
- **Rotating the master key.** Follow the rotation steps above, then run `spanlight reseal-credentials`. It opens every credential whose `key_id` is not the first key's id and seals it again under the first key, in batches, committing after each; a row that another transaction holds is waited for, never skipped. It prints how many it re-sealed and how many it could not open (their ids are logged), then counts again the rows still sealed under an older key and exits non-zero while any remain. Only when it exits successfully does no provider credential need the older keys. Running it again is harmless: rows already under the first key are not touched.
- **A credential that cannot be opened** (its key left the keyring, or the bytes were changed) fails its check with `key cannot be decrypted` and works again once it is rotated.
