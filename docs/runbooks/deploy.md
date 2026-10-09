# Deploy a new version

## Purpose and when to use

Ship a new Spanlight build to a running instance: apply database migrations, replace the api, worker and web containers, and confirm the result. Use it for every upgrade, including a patch release.

Migrations run before the new api starts and are applied with `spanlight migrate` (Alembic `upgrade head`). They are forward changes to a live database, so take a backup first; [rollback.md](rollback.md) explains what a rollback costs once a migration has run.

## Prerequisites

- Shell access to the host that runs Docker Compose, or the Railway CLI logged in (`railway whoami`) and linked to the project.
- The version you are shipping, as a git tag or commit in this checkout.
- For a backup: object storage (`S3_BUCKET`, `S3_ACCESS_KEY`, `S3_SECRET_KEY`) and `BACKUP_DATABASE_URL` configured. Without them there is no automatic backup; take a `pg_dump` yourself (step 2).
- Five minutes with nobody else changing `deploy/.env`.

## Docker Compose

Define the shortcut once per shell:

```bash
spl() { docker compose -f deploy/compose.yaml --env-file deploy/.env "$@"; }
```

### 1. Record where you are now

You need this to roll back.

```bash
git rev-parse --short HEAD
spl exec postgres psql -U postgres -d spanlight -tA -c "SELECT version_num FROM alembic_version"
curl -fsS "$BASE/health/ready"
```

Write down the commit and the revision (for example `0015`). Expected last line: `{"status":"ok","database":"ok","migrations":"ok","worker_heartbeat_age_s":4.2,"outbox_backlog":0}`. If the instance is not healthy before you start, fix that first (see [README.md](README.md#first-five-minutes-of-any-incident)).

### 2. Take a backup

With backups configured:

```bash
spl exec worker spanlight backup now
```

Expected: `Backed up to backups/2026/10/09/spanlight-20261009T143012Z.dump (48213377 bytes).` (your own key and size). Confirm it is listed:

```bash
spl exec worker spanlight backup list
```

Without object storage, dump the database to a file on the host. The image's `pg_dump` is version 17, the same as the server, so run it in the `postgres` container:

```bash
spl exec -T postgres pg_dump -U postgres -Fc --no-unlogged-table-data spanlight > spanlight-before-deploy.dump
ls -l spanlight-before-deploy.dump
```

`-T` keeps the terminal out of the binary dump. The file must not be empty. It holds every prompt and completion: store it privately and delete it when the deploy is confirmed good.

### 3. Get the new code

```bash
git fetch --tags
git checkout <tag-or-commit>
```

Read what changed in `deploy/.env.example` between the old and new versions. A new required variable stops the stack from starting with `set <NAME>` in the error; add it to `deploy/.env`:

```bash
git diff <old-commit> HEAD -- deploy/.env.example deploy/compose.yaml
```

### 4. Build and start

```bash
spl up -d --build
```

Compose rebuilds the images, then runs `migrate` to completion (it applies migrations as the database owner and refreshes the `spanlight_app` role). `api` and `worker` start only after `migrate` succeeds, and `web` starts once `api` is healthy. The containers whose image or environment changed are recreated, so requests can fail for a few seconds. The Python SDK retries network errors, 429 and 5xx with backoff (`max_retries=5` by default), so a short gap does not lose spans from SDK clients.

### 5. Check that migrations ran

```bash
spl logs migrate
```

Expected, in this order:

```
Database is at the latest migration.
Role spanlight_app is ready (no superuser, no RLS bypass).
```

If `migrate` failed, the api never started. Read the error above those lines, then go to [Escape hatch](#escape-hatch).

### 6. Verify

```bash
spl ps
curl -fsS "$BASE/health/ready"
spl logs --since 2m worker | grep worker_started
```

Expected:

- `spl ps`: `postgres`, `api`, `worker` and `web` running; `api` healthy; `migrate` exited with code 0.
- `/health/ready`: `{"status":"ok","database":"ok","migrations":"ok","worker_heartbeat_age_s":4.2,"outbox_backlog":0}`.
- The worker log has one `worker_started` line listing its tasks.

Then check real traffic: open the dashboard, sign in, and confirm new spans arrive from one of your applications (the newest trace is minutes old, not hours). Check the first ten minutes of error rate on the api:

```bash
spl logs --since 10m api | grep -c '"level": "error"'
```

Logs are JSON lines. A handful of errors is a signal to look; a stream of them is a signal to [roll back](rollback.md).

Do not use `deploy/smoke.sh` to verify production. It builds and then deletes (`down -v`) its own stack on port `WEB_PORT`, which collides with the running one. Run it only on a separate machine or a CI runner.

### 7. Clean up

When the deploy is good for at least a day, delete the pre-deploy dump file from the host. Old Docker images stay on disk until you prune them:

```bash
docker image prune
```

## Railway

Deploy the api first: its pre-deploy command runs `spanlight migrate && spanlight ensure-app-role --role spanlight_app` as the Postgres owner, and a failure there stops the deploy and leaves the running version untouched.

1. Record the current state and take a backup.

   ```bash
   git rev-parse --short HEAD
   curl -fsS https://$DOMAIN/health/ready
   ```

   Write down the commit. The Railway setup has backups off: the object-storage and backup settings are commented-out opt-in blocks in `railway.ts`, so the nightly backup job ends `skipped_not_configured` until you enable them (see [Optional features](../deploy/railway.md#optional-features) in the Railway guide). If backups are configured, run one now from a shell inside the service (`railway ssh --service worker`, then `spanlight backup now`); it prints `Backed up to <key> (<n> bytes).`. If they are not, use Railway's own backup of the Postgres service from the dashboard, or a `pg_dump -Fc` against the database from a host that can reach it.

2. Check out the new version and apply any infrastructure change.

   ```bash
   git checkout <tag-or-commit>
   railway config plan --file deploy/railway/railway.ts
   ```

   The plan must show only changes you expect. Apply with `railway config apply --file deploy/railway/railway.ts`. A variable that exists in Railway but is missing from `railway.ts` is deleted by an apply, so read the plan before applying.

3. Deploy in this order.

   ```bash
   railway up --service api
   railway up --service worker
   railway up --service web
   ```

   Each command exits 0 once its deployment is live. In the api's deploy logs, the pre-deploy step prints `Database is at the latest migration.` and `Role spanlight_app is ready (no superuser, no RLS bypass).`; the api goes live once `/health/live` answers 200 (its Railway healthcheck is liveness only, because `/health/ready` also needs a worker heartbeat and the worker deploys after the api). `railway logs --service api --latest` shows the logs of a failed deploy.

4. Verify.

   ```bash
   curl -fsS https://$DOMAIN/health/ready
   railway logs --service worker --lines 200 | grep worker_started
   ```

   Expected: `{"status":"ok","database":"ok","migrations":"ok","worker_heartbeat_age_s":4.2,"outbox_backlog":0}` and a `worker_started` line from the new worker. Until the worker has deployed and beaten once, `/health/ready` is a `503` for that reason alone; wait for the worker deploy before you judge it.

If you deploy from GitHub (see [the Railway guide](../deploy/railway.md)), pushes to `main` deploy automatically; Railway does not read `railway.ts` on deploy, so run `railway config apply` yourself for infrastructure changes.

## Escape hatch

- **`migrate` failed or the new api does not become ready, and no migration ran:** the old containers are gone on Compose (the images were rebuilt), so go back to the previous commit and rebuild: `git checkout <old-commit>` then `spl up -d --build`. On Railway the previous api deployment keeps serving because the pre-deploy failed.
- **The new version is live and wrong:** follow [rollback.md](rollback.md). If a migration ran, read it first: the old build refuses to become ready on a newer schema.
- **Data is damaged:** follow [restore.md](restore.md) with the backup from step 2.
