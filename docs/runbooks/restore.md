# Restoring a database backup

Spanlight dumps its database every night at 03:00 UTC with `pg_dump -Fc --no-unlogged-table-data`
and stores the dump in your object storage under `backups/YYYY/MM/DD/spanlight-<UTC timestamp>.dump`.
It keeps the newest backup of each of the last 14 days and of the last 8 Sundays.

A restore always goes into a new, empty database. `spanlight restore` refuses a database that
already has tables, so it cannot overwrite live data.

## Before you start

- The backup job needs object storage (`S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) and
  `BACKUP_DATABASE_URL`. The tenant tables have row-level security forced on and `pg_dump` turns
  it off for the dump, which fails unless the role can bypass it: use a superuser or a role with
  `BYPASSRLS`, never the application role. Managed PostgreSQL services usually have no true
  superuser, so create a `BYPASSRLS` role there. With
  `BACKUPS_ENABLED=false`, or without either setting, the nightly job ends `done` with outcome
  `skipped_not_configured` and takes no backup.
- Set a lifecycle rule on the bucket that aborts incomplete multipart uploads after a day
  (`AbortIncompleteMultipartUpload`, `DaysAfterInitiation: 1`). A crash in the middle of a backup
  can leave uploaded parts behind, and they cost storage until the rule removes them.
- A dump contains every prompt and completion your applications sent. Keep the bucket private and
  encrypted at rest, and restore only onto infrastructure you trust.
- The commands below run wherever the `spanlight` CLI is installed with the same object storage
  settings, for example inside the `worker` container:
  `docker compose -f deploy/compose.yaml --env-file deploy/.env exec worker sh`.
  The image includes `pg_restore` 17. Outside the image you need PostgreSQL client tools 17.

If you run the Docker Compose stack in `deploy/compose.yaml`, follow
[Restoring on Docker Compose](#restoring-on-docker-compose): it does the same steps with the
container names and the fixed database name that file uses. The steps below are for any other
deployment.

## Steps

1. **List the backups.**

   ```bash
   spanlight backup list
   ```

   Each line is the key, the size in bytes and the upload time. Pick the key you want, usually the
   newest one before the incident.

2. **Create a fresh, empty database** on a PostgreSQL 17 server and note its URL. For example, as
   the database owner:

   ```bash
   psql "$ADMIN_URL" -c 'CREATE DATABASE spanlight_restored'
   ```

3. **Restore into it.** Pass the URL in the environment rather than on the command line, so the
   password stays out of the process list and your shell history:

   ```bash
   export RESTORE_TARGET_URL='postgresql://postgres:<password>@<host>:5432/spanlight_restored'
   spanlight restore --key backups/2026/10/09/spanlight-20261009T030000Z.dump
   ```

   The URL must name the host and the database. The command streams the dump from object storage
   straight into `pg_restore --no-owner --no-privileges --single-transaction`, so no disk space is
   needed for the dump and a failure leaves the target empty. It exits non-zero and prints the end
   of `pg_restore`'s error output if anything fails.

4. **Create the application role.** Dumps carry neither owners nor privileges, so the restored
   database has no role the API and worker can use. Point the CLI at the restored database as its
   owner and run:

   ```bash
   export DATABASE_URL="$RESTORE_TARGET_URL" APP_DB_PASSWORD='<at least 16 characters>'
   spanlight ensure-app-role
   ```

   Roles belong to the whole PostgreSQL server, not to one database, and this command sets the
   role's password. If the restored database is on the same server as a deployment that is still
   running, use that deployment's `APP_DB_PASSWORD`: a different value changes the password the
   running API and worker connect with, and they stop working.

   Row-level security only protects tenants when the application connects as this role, never as
   a superuser.

5. **Point Spanlight at the restored database.** Set the API and worker `DATABASE_URL` to the
   restored database using the app role, then start them. When you restore an older backup into
   a newer release, run `spanlight migrate` first (as the database owner) to bring the schema up
   to date.

## Restoring on Docker Compose

`deploy/compose.yaml` fixes the database name: the API, the worker and the `migrate` service all
connect to the database `spanlight` on the bundled `postgres` service. So the restore goes into a
second database on the same server, and the two are then swapped by renaming them. The old
database is kept under another name until you have checked the restored one.

Run these from the repository root. If you start the stack with extra files (such as
`deploy/compose.minio.yaml` or `deploy/compose.replicas.yaml`), add the same `-f` options to the
function.

```bash
spl() { docker compose -f deploy/compose.yaml --env-file deploy/.env "$@"; }
```

1. **List the backups** and pick a key. `run --rm --no-deps` starts a one-off container with the
   worker's settings (which include the object storage), even while the worker is stopped:

   ```bash
   spl run --rm --no-deps worker spanlight backup list
   ```

2. **Stop everything that connects to the database.** Data written after this point would not be
   in the restored database anyway, and the rename in step 5 needs the database to be unused:

   ```bash
   spl stop web api worker
   ```

3. **Create an empty database** next to the live one:

   ```bash
   spl exec postgres psql -U postgres -d postgres -c 'CREATE DATABASE spanlight_restored'
   ```

4. **Restore into it.** The URL uses the owner password from `deploy/.env`, read by the shell so
   it never appears on the command line, and reaches the container through `-e`:

   ```bash
   export RESTORE_TARGET_URL="postgresql://postgres:$(sed -n 's/^POSTGRES_PASSWORD=//p' deploy/.env)@postgres:5432/spanlight_restored"
   spl run --rm --no-deps -e RESTORE_TARGET_URL worker \
     spanlight restore --key backups/2026/10/09/spanlight-20261009T030000Z.dump
   unset RESTORE_TARGET_URL
   ```

   This assumes `POSTGRES_PASSWORD` has no characters that need escaping in a URL. If a step
   fails, the stack is still stopped and the live database is untouched: start it again with
   `spl start worker api web`.

5. **Swap the databases.** Keep the current one as `spanlight_before_restore`, then give the
   restored one the name the stack uses:

   ```bash
   spl exec postgres psql -U postgres -d postgres \
     -c 'ALTER DATABASE spanlight RENAME TO spanlight_before_restore' \
     -c 'ALTER DATABASE spanlight_restored RENAME TO spanlight'
   ```

   If the first rename fails with "database is being accessed by other users", something still
   holds a connection; find it with
   `SELECT pid, usename, application_name FROM pg_stat_activity WHERE datname = 'spanlight'`.

6. **Grant the app role and bring the schema up to date, then start the stack.** The dump carries
   no privileges, so the existing `spanlight_app` role cannot read the restored database yet. The
   `migrate` service runs `spanlight migrate` and then `spanlight ensure-app-role` as the owner,
   which grants the role access and upgrades an older backup to the schema of the release you
   run. It sets the role's password to `APP_DB_PASSWORD` from `deploy/.env`, the value the stack
   already uses, so leave that variable unchanged.

   ```bash
   spl run --rm migrate
   spl up -d
   ```

7. **Check the result** with the queries in [Verify](#verify), for example
   `spl exec postgres psql -U postgres -d spanlight -c 'SELECT max(started_at) FROM traces'`,
   and confirm that `/health/ready` answers 200.

8. **Remove the old database** once you no longer need it. Until then it is a complete copy of
   the data from before the restore, and it uses disk space:

   ```bash
   spl exec postgres psql -U postgres -d postgres -c 'DROP DATABASE spanlight_before_restore'
   ```

   To go back instead, stop the stack as in step 2, rename `spanlight` to another name and
   `spanlight_before_restore` back to `spanlight`, and start the stack with `spl up -d`.

## Verify

Compare the restored database with what you expect, using the owner URL:

```sql
-- Row counts of the main tables.
SELECT 'organizations' AS table_name, count(*) FROM organizations
UNION ALL SELECT 'projects', count(*) FROM projects
UNION ALL SELECT 'traces', count(*) FROM traces
UNION ALL SELECT 'spans', count(*) FROM spans;

-- The newest trace, to confirm the data is as recent as the backup.
SELECT max(started_at) FROM traces;

-- The schema version matches the release you run.
SELECT version_num FROM alembic_version;
```

Open the dashboard, sign in and open one trace to confirm that its spans, prompts and
completions load.

Rollup tables are derived data. If the dashboard's long-range charts look thin, the next
`rollup_hourly` runs rebuild the last 48 hours, and `spanlight rollups backfill` rebuilds older
ranges.

## What a backup leaves out

- Rate-limit buckets (an `UNLOGGED` table). They hold only short-lived counters and refill on
  their own.
- Anything outside the database: object storage contents other than backups, environment
  variables, and `CREDENTIALS_KEYS`. Keep `CREDENTIALS_KEYS` in your secret manager; encrypted
  values in a restored database cannot be read without it.
