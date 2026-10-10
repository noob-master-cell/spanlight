# Alert evaluation load test

Measures one pass of the alert evaluation job over 1 000 alert evaluations: 50 projects, each with 18 rules and 2 budgets (a budget is evaluated by a hidden rule of its own) and 7 days of spans and rollups. The limit is **10 seconds** for the pass; the method and the recorded result are in [Performance](../../docs/performance.md#alert-evaluation).

| File | What it does |
|---|---|
| `seed_alerts.py` | Creates the projects (one organization each), stores their spans through the ingestion pipeline, builds the hourly rollups with `backfill_rollups`, then creates the rules and budgets through the same services the API uses. Refuses a database that already has alert rules. |
| `seed_alert_rules.py` | The rules and budgets of one project (pure). Threshold and anomaly rules over every metric, windows from 15 minutes to a day, some with environment, provider or model filters, and several that share `(metric, window, filters)` so the per-pass metric cache matters. One rule breaches on the first pass. Two budgets, one notifying and one blocking. |

No rule names a notification channel, so a transition writes its event but queues nothing in the outbox. The test measures evaluation, not delivery.

## On GitHub

The **Load test** workflow ([`load-smoke.yml`](../../.github/workflows/load-smoke.yml)) has a job `alerts-eval` that runs with every dispatch, on a stack of its own. It seeds, runs `spanlight alerts evaluate` three times in the worker container, writes the median to the run's summary and fails when the median is over 10 s, when fewer than 1 000 rules were evaluated, or when any rule or project errored. The worker's own evaluation job is switched off (`ALERTS_EVALUATION_ENABLED=false`) so it does not take rules away from the timed passes.

The passes are real, not `--dry-run`: the commit of each rule is part of what an evaluation costs, and a dry run would leave it out. The first pass also opens one event per project (the "Traffic present" rule breaches); the next two find nothing to change.

`spanlight alerts evaluate --dry-run` does the same work and rolls it back, but it holds the row lock of every rule it evaluates until it ends: a live worker skips those rules for that minute and edits of a rule wait. Do not use it on a system people are using; the load job does not.

## On your machine

Start a stack of its own with the load override, as in [the load test README](README.md), and turn the worker's evaluation off so it does not compete with the passes you time:

```bash
echo 'ALERTS_EVALUATION_ENABLED=false' >> deploy/.env   # remove this line when you are done
docker compose -p spanlight-load -f deploy/compose.yaml -f backend/load/compose.load.yaml \
  --env-file deploy/.env up -d --build
```

Seed (the owner URL, as for `seed.py`; the default is 50 projects with 5 000 spans each over 7 days):

```bash
cd backend
export LOAD_DATABASE_URL="postgresql+psycopg://postgres:$(sed -n 's/^POSTGRES_PASSWORD=//p' ../deploy/.env)@127.0.0.1:55433/spanlight"
uv run python load/seed_alerts.py
cd ..
```

Run three passes and read the seconds:

```bash
for run in 1 2 3; do
  docker compose -p spanlight-load -f deploy/compose.yaml -f backend/load/compose.load.yaml \
    --env-file deploy/.env exec -T worker spanlight alerts evaluate
done
```

Expected, per pass: `Evaluated 1000 rules in 50 projects in <seconds> s.`, the counts by outcome (`ok` plus `no_data` plus `error` is 1 000, `error` is 0) and the transitions. Use `--json` for one JSON object per pass (logs go to stderr, so stdout is only that object). When a pass is slow, `EXPLAIN (ANALYZE)` the slowest query (turn on `log_min_duration_statement` for the database) and check that rules sharing a metric, window and filters read the database once: the cache works per project and per pass.
