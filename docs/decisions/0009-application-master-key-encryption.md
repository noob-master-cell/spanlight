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
- **Rotation.** Put a new entry first and keep the old ones: `v2:<new key>,v1:<old key>`. New data is sealed under `v2`, old data still opens under `v1`. Every service that opens data (the api and the worker) needs the new key before any service seals with it, so first append the new entry after the old one, deploy, then move it to the front. Never remove a key that still seals data: those rows fail with an unknown-key error. Re-sealing old rows under the new key needs a job that does not exist yet; it is planned for Phase 2, and until it ships the old key stays in the keyring.
- **Scope.** This protects data at rest in the database and its backups. It does not protect against someone who controls the running application, because the process holds the key in memory.
