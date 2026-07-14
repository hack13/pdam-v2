# Sync worker

PDAM queues destination backups in PostgreSQL with pg-boss. The web application only creates jobs; a separate Node process consumes them.

Start the worker from the project directory:

```bash
pnpm sync:worker
```

The worker loads `.env`, connects to `DATABASE_URL`, creates/maintains the `pgboss` schema, and listens on both the `pdam-sync-destination` and `pdam-upload-promotion` queues. Set `SYNC_WORKER_CONCURRENCY` to control concurrent jobs; the default is `2`.

Large asset uploads first land in `pending-uploads/<session-id>`. After the API verifies their hash and size, it queues an upload-promotion job. The worker copies the object to its content-addressed `blobs/` key, updates the database, links the file to the asset version, and deletes the staging object. Run `pnpm uploads:enqueue-promotions` once after deploying this change to promote already-completed staged uploads.

The worker also owns a pg-boss schedule named `pdam-sync-scheduler` that emits one scheduler tick per minute. The tick checks each enabled destination against its user-configured daily or weekly schedule and queues only destinations that are due. No external cron job or HTTP scheduler call is required.

Users configure the frequency, time, weekday, and browser time zone on the Destinations page. The worker itself should be supervised by systemd, Docker Compose, Kubernetes, or another process manager and should remain running; pg-boss scheduling requires at least one running instance.

The protected `/api/sync/scheduler` endpoint remains available as a manual/admin trigger for operational recovery, but it is not part of the normal automated-backup path.

pg-boss owns durable queue state, retry/backoff, heartbeats, expiration, and cancellation. PDAM's `sync_runs` and `sync_items` tables remain the user-facing audit and per-file progress records. A retry skips completed files by content hash and resumes failed work.
