# Sync worker

PDAM queues destination backups in PostgreSQL with pg-boss. The web application only creates jobs; a separate Node process consumes them.

Start the worker from the project directory:

```bash
pnpm sync:worker
```

The worker loads `.env`, connects to `DATABASE_URL`, creates/maintains the `pgboss` schema, and listens on the `pdam-sync-destination` queue. Set `SYNC_WORKER_CONCURRENCY` to control concurrent destination jobs; the default is `2`.

The worker also owns a pg-boss schedule named `pdam-sync-scheduler` that emits one scheduler tick per minute. The tick checks each enabled destination against its user-configured daily or weekly schedule and queues only destinations that are due. No external cron job or HTTP scheduler call is required.

Users configure the frequency, time, weekday, and browser time zone on the Destinations page. The worker itself should be supervised by systemd, Docker Compose, Kubernetes, or another process manager and should remain running; pg-boss scheduling requires at least one running instance.

The protected `/api/sync/scheduler` endpoint remains available as a manual/admin trigger for operational recovery, but it is not part of the normal automated-backup path.

pg-boss owns durable queue state, retry/backoff, heartbeats, expiration, and cancellation. PDAM's `sync_runs` and `sync_items` tables remain the user-facing audit and per-file progress records. A retry skips completed files by content hash and resumes failed work.
