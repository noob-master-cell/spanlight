# 11. Notifications go through a transactional outbox in Postgres

Date: 2026-10-08 · Status: accepted

## Context

Spanlight has to send mail (address verification, password reset, invitations) and, later, alerts to Slack, signed webhooks and PagerDuty. Each of these has the same shape: something happens in the database, and an outside system has to be told.

Calling the outside system from the request handler gets this wrong in both directions. If the handler sends first and the transaction then rolls back, the user gets a reset link for a reset that never happened. If it commits first and the send then fails, or the process dies in between, the notification is lost and nothing remembers that it was owed. A mail server that is down for ten minutes should delay a notification, not drop it, and it should not turn a signup request into a `500`.

A message broker would solve this, but [Postgres is already the only datastore](0001-postgres-only-storage.md), and a broker would reintroduce the dual write: the row and the message would again be written to two systems.

## Decision

Write the notification to an **outbox table** in the same transaction as the change that caused it, and let the worker deliver it.

- **Producer.** `enqueue` inserts a `pending` row into `notification_outbox` using the caller's session and never commits. The decision and its delivery request commit or roll back together.
- **Shape of a row.** `kind` says what delivers it (`email` now) and is plain text, so a new kind needs no migration. `target` says where it goes and `payload` what it says. `channel_id` is reserved for the notification channels added with alerting; it has no foreign key yet. The table belongs to no project, so it has no row-level security.
- **Delivery.** The worker runs a `deliver_notifications` job every 30 seconds. For each due row it opens a **short transaction of its own**: select the oldest pending row whose `next_attempt_at` has passed with `FOR UPDATE SKIP LOCKED`, send it under a 15 second timeout, record the outcome, commit. Rows are handled one at a time, so a lock never spans more than one send, and any number of workers can run the job without sharing a row. A run stops when nothing is due or after 30 seconds, which keeps it, plus one last send, inside the worker's task timeout.
- **Deliverers.** A registry maps each kind to a deliverer, registered explicitly when a process starts. A deliverer reports failure by raising.
- **Retries.** A failed attempt increments `attempts` and schedules the next one after 30 seconds, doubling each time (30 s, 1 min, 2 min, and so on) up to one hour. The eighth failed attempt marks the row `failed`. Whatever the deliverer raises, including a timeout, is recorded as the class name and message in `last_error`, cut to 500 characters, and never stops the rows behind it. The text is made storable first (a NUL byte or a lone surrogate, which a provider's reply can contain, is written as an escape sequence), and if saving an outcome fails anyway, the attempt is still counted in a fresh transaction with a generic error, so no row can stay at the head of the queue and block the ones behind it.
- **Unknown kind.** A row whose kind has no registered deliverer is marked `failed` at once. Retrying cannot help, because nothing will register a deliverer while the row waits.
- **At-least-once.** If the process dies after a send and before its commit, the row is still `pending` and is sent again. Deliverers must tolerate a repeat, and the outbox does not claim exactly-once.
- **Once a row is settled.** A row is settled when it is `sent` or has `failed` for good (attempts used up, or no deliverer for its kind). At that point its payload is reduced to `{"subject": ...}` (or `{}` when there is none), and `sent_at` is also set for a sent row. The body of a mail holds links with tokens in them, and nothing needs them once the row will not be tried again. This matters most for failed rows: a password-reset email that never went out would otherwise keep a working account-takeover link in the database for as long as the row is kept. A row that will be retried keeps its whole payload, because the next attempt needs it, so a link is readable in the database only while its mail is still waiting to go out.
- **Pruning.** A cleanup job deletes `sent` and `failed` rows older than 7 days. Pending rows are never deleted, however old.
- **Observability.** `spanlight_outbox_pending` is the number of pending rows after each run, and `spanlight_notifications_delivered_total{kind,outcome}` counts attempts as `sent`, `retry` or `failed`.

## Consequences

- **Latency is the poll interval.** A notification goes out within about 30 seconds of the commit, not instantly. This suits mail and alerts. If a kind ever needs faster delivery, the worker can be woken with `LISTEN`/`NOTIFY` without changing the table.
- **Duplicates are possible, losses are not.** After a crash a user can, rarely, receive the same notification twice.
- **A permanent failure is visible, not silent.** `failed` rows stay for a week with their subject, target and last error (not their body), and the pending gauge shows a backlog building up.
- **The worker must run.** Nothing is sent without it. A stopped worker shows up as `spanlight_outbox_pending` growing, so alert on that.
- **A send holds a database connection.** The row lock lives in the open transaction, so a slow provider ties up one connection for up to the 15 second timeout. Sends are serial within a run, so one run never needs more than one.
- **Failed rows are not retried automatically.** After the eighth attempt a person, or a later replay feature, has to act. The body is gone by then, so a replay has to rebuild the message from the data that caused it instead of resending the stored text.
