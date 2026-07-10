# Sync worker

PDAM queues destination backups in PostgreSQL with pg-boss. The web application only creates jobs; a separate Node process consumes them.

Start the worker from the project directory:

```bash
pnpm sync:worker
```

The worker loads `.env`, connects to `DATABASE_URL`, creates/maintains the `pgboss` schema, and listens on the `pdam-sync-destination` queue. Set `SYNC_WORKER_CONCURRENCY` to control concurrent destination jobs; the default is `2`.

The application exposes a protected scheduler endpoint. Cron should call it directly; it only queues destinations whose user-configured daily or weekly schedule is due:

```bash
curl -X POST https://pdam.example/api/sync/scheduler \
  -H "x-sync-worker-secret: your-secret"
```

Run that request from cron or a platform scheduler. Users configure the frequency, time, weekday, and browser time zone on the Destinations page. The worker itself should be supervised by systemd, Docker Compose, Kubernetes, or another process manager and should remain running.

pg-boss owns durable queue state, retry/backoff, heartbeats, expiration, and cancellation. PDAM's `sync_runs` and `sync_items` tables remain the user-facing audit and per-file progress records. A retry skips completed files by content hash and resumes failed work.
