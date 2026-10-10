# 11. Notifications go through a transactional outbox in Postgres

Date: 2026-10-08 · Status: accepted

## Context

Spanlight has to send mail (address verification, password reset, invitations) and, later, alerts to Slack, signed webhooks and PagerDuty. Each of these has the same shape: something happens in the database, and an outside system has to be told.

Calling the outside system from the request handler gets this wrong in both directions. If the handler sends first and the transaction then rolls back, the user gets a reset link for a reset that never happened. If it commits first and the send then fails, or the process dies in between, the notification is lost and nothing remembers that it was owed. A mail server that is down for ten minutes should delay a notification, not drop it, and it should not turn a signup request into a `500`.

A message broker would solve this, but [Postgres is already the only datastore](0001-postgres-only-storage.md), and a broker would reintroduce the dual write: the row and the message would again be written to two systems.

## Decision

Write the notification to an **outbox table** in the same transaction as the change that caused it, and let the worker deliver it.

- **Producer.** `enqueue` inserts a `pending` row into `notification_outbox` using the caller's session and never commits. The decision and its delivery request commit or roll back together.
- **Shape of a row.** `kind` says what delivers it (`email`, `slack`, `webhook`, `pagerduty`) and is plain text, so a new kind needs no migration. `target` says where it goes and `payload` what it says. `channel_id` names the alert channel a row belongs to and is null for transactional mail; it has no foreign key. The table belongs to no project, so it has no row-level security.
- **Delivery.** The worker runs a `deliver_notifications` job every 30 seconds. Each due row is claimed under a lease, sent under a 15 second timeout with no transaction open, and settled, each step in a short transaction of its own (see "Leases and fencing" below). Rows are handled one at a time, and any number of workers can run the job without sharing a row. A run stops when nothing is due or after 30 seconds, which keeps it, plus one last send, inside the worker's task timeout.
- **Deliverers.** A registry maps each kind to a deliverer, registered explicitly when a process starts. A deliverer reports failure by raising; `PermanentDeliveryError` means a retry cannot succeed and fails the row at once.
- **Retries.** A failed attempt increments `attempts` and schedules the next one after 30 seconds, doubling each time (30 s, 1 min, 2 min, and so on) up to one hour. The eighth failed attempt marks the row `failed`. Whatever the deliverer raises, including a timeout, is recorded in `last_error`, cut to 500 characters, and never stops the rows behind it. Only a message the deliverer composed for the purpose (a `DeliveryError`) is stored as written; any other exception is recorded by its class name alone, because its text can quote the request URL, and a Slack webhook URL is itself a secret. The text is made storable first (a NUL byte or a lone surrogate is written as an escape sequence), and the payload is reduced in SQL from the stored value, so every outcome write uses values Postgres accepts.
- **Unknown kind.** A row whose kind has no registered deliverer is marked `failed` at once. Retrying cannot help, because nothing will register a deliverer while the row waits.
- **At-least-once.** If the process dies after a send and before its outcome is recorded, the row is still `pending`, its lease expires, and it is sent again. Deliverers must tolerate a repeat, and the outbox does not claim exactly-once.
- **Once a row is settled.** A row is settled when it is `sent` or has `failed` for good (attempts used up, or no deliverer for its kind). At that point its payload is reduced to its `subject` and `summary` keys, each kept only when present (a summary describes the alert a row carried), and `sent_at` is also set for a sent row. A failed alert delivery (one with a `channel_id`) is the exception: it keeps its payload so a person can retry it, and alert payloads hold no secrets. The body of a mail holds links with tokens in them, and nothing needs them once the row will not be tried again. This matters most for failed rows: a password-reset email that never went out would otherwise keep a working account-takeover link in the database for as long as the row is kept. A row that will be retried keeps its whole payload, because the next attempt needs it, so a link is readable in the database only while its mail is still waiting to go out.
- **Pruning.** A cleanup job deletes `sent` and `failed` rows older than 7 days. Pending rows are never deleted, however old.
- **Observability.** `spanlight_outbox_pending` is the number of pending rows after each run, and `spanlight_notifications_delivered_total{kind,outcome}` counts attempts as `sent`, `retry`, `failed` or `lost` (another worker took the row over, see below).

## Consequences

- **Latency is the poll interval.** A notification goes out within about 30 seconds of the commit, not instantly. This suits mail and alerts. If a kind ever needs faster delivery, the worker can be woken with `LISTEN`/`NOTIFY` without changing the table.
- **Duplicates are possible, losses are not.** After a crash a user can, rarely, receive the same notification twice.
- **A permanent failure is visible, not silent.** `failed` rows stay for a week with their subject, target and last error (not the body of a mail), and the pending gauge shows a backlog building up.
- **The worker must run.** Nothing is sent without it. A stopped worker shows up as `spanlight_outbox_pending` growing, so alert on that.
- **A send holds no database connection.** The lease lives in the row, not in an open transaction, so a slow provider ties up no connection or lock while it answers.
- **Failed rows are not retried automatically.** After the eighth attempt a person has to act. A failed alert delivery keeps its payload for that; a failed mail does not, so resending it means rebuilding the message from the data that caused it.

## Leases and fencing

Added 2026-10-10, when alert delivery to Slack, webhooks and PagerDuty arrived. It replaced the row lock that Phase 1 held across a send.

Alert deliveries call outside HTTP services, and holding a row lock and a database connection for the length of each call no longer fits. Each row now carries a lease (`lease_until`) and a fencing token (`fence`, a counter), and a delivery is three short transactions with the send between them:

- **Claim.** Select one due, pending row that nobody holds (`lease_until` is null or past) with `FOR UPDATE SKIP LOCKED`, increment `fence`, set `lease_until` to 60 seconds ahead, commit. The worker keeps the `fence` it set.
- **Confirm.** Immediately before the send, extend the lease with an update conditional on that `fence` and on the row still being pending. If no row matches, another worker has claimed it since, and nothing is sent.
- **Send** with no transaction open, under the same 15 second timeout.
- **Mark** the row sent or failed, again conditional on the `fence`. If no row matches, the outcome is dropped, logged as `outbox_lease_lost` and counted with the outcome `lost`.

A worker that stalls past its lease can therefore lose the row to another worker, but it can neither send after the other worker has claimed the row nor settle the row a second time. Delivery stays at least once: a worker that dies after the provider accepted a message and before its mark leaves the lease to expire, and the row is sent once more. Webhook and PagerDuty receivers can drop the repeat by the delivery id each row carries; for email and Slack the window is one lease per crash.

Two further changes came with it:

- **One egress check for every outbound call.** The check that keeps the gateway off private addresses moved from the gateway to `app/core/egress.py`, and the Slack, webhook and PagerDuty deliverers connect through it too. Webhooks may reach private addresses only when `WEBHOOK_ALLOW_PRIVATE_TARGETS` is set.
- **A failed alert delivery keeps its payload.** Transactional mail is still reduced to its subject and summary once it is settled, so a reset link does not outlive its mail. An alert delivery (a row with a channel) that fails for good keeps its payload, so it can be retried from the channel's delivery log; alert payloads carry no secrets.

Consequences of the lease:

- **Clocks matter.** A lease is computed from the clock of the process that takes it, and compared with the clock of the next one that looks. Skew between hosts lengthens or shortens a lease by that much, so hosts running the api and the worker must keep their clocks synchronised (NTP).
- **Upgrade all workers together.** A worker from before leases ignores them: it could send a row a new worker holds, and its writes break the rule that a settled row holds no lease. Restart every worker when the migration that adds the lease is applied.
- **A process killed mid-send repeats the send.** The attempt is counted when its outcome is recorded, so a send that never finishes (a worker cancelled by its task timeout) is tried again once its lease expires, without using up an attempt.
