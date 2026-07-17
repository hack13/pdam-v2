# Sync worker and production deployment

TailCache queues destination backups in PostgreSQL with pg-boss. The web application only creates jobs; a separate Node process consumes them. If a run remains queued, the transfer has not started.

## Production requirements

Deploy both services; the Docker image's default command starts only the web application:

```bash
docker compose run --rm migrate
docker compose up -d --build app worker
docker compose ps
docker compose logs -f worker
```

The `app` and `worker` services must share these values:

- `DATABASE_URL`
- The source storage configuration (`S3_*`) or the same persistent `UPLOADS_DIR` volume
- A stable `WEBHOOK_SECRET_ENCRYPTION_KEY` (or the same existing `BETTER_AUTH_SECRET` during a deliberate key migration)

Never rely on the development encryption fallback in production. A worker with a different key cannot decrypt destination credentials and will fail jobs after it begins consuming them.

Start the worker manually from the project directory with:

```bash
pnpm sync:worker
```

The worker creates/maintains the `pgboss` schema and listens on the destination, scheduler, and upload-promotion queues. `SYNC_WORKER_CONCURRENCY` controls destination transfers and defaults to `1`; `UPLOAD_PROMOTION_CONCURRENCY` controls source upload promotion and defaults to `2`.

Large asset uploads first land in `pending-uploads/<session-id>`. After the API verifies their hash and size, it queues an upload-promotion job. The worker copies the object to its content-addressed `blobs/` key, updates the database, links the file to the asset version, and deletes the staging object. Run `pnpm uploads:enqueue-promotions` once after deploying this change to promote already-completed staged uploads.

The worker owns a pg-boss schedule named `pdam-sync-scheduler` that emits one scheduler tick per minute. The tick checks each enabled destination against its user-configured daily or weekly schedule and queues only destinations that are due. No external cron job or HTTP scheduler call is required.

The worker must be supervised by Docker Compose, systemd, Kubernetes, or another process manager and remain running; pg-boss scheduling requires at least one healthy instance. The Compose service has a restart policy and a 25-minute graceful stop window so an active large-file chunk can finish before restart.

The protected `/api/sync/scheduler` endpoint remains available as a manual/admin trigger for operational recovery, but it is not part of the normal automated-backup path.

pg-boss owns durable queue state, retry/backoff, heartbeats, expiration, and cancellation. Destination jobs use a 23-hour, 59-minute expiry because pg-boss requires the value to be strictly below 24 hours; they have five retries. TailCache's `sync_runs` and `sync_items` tables remain the user-facing audit and per-file progress records. Nextcloud transfers persist their upload session and transferred byte count, so a worker retry can resume already-uploaded chunks.

## Nextcloud destinations

Choose **Nextcloud (resumable)** when adding a destination and use its authenticated collection URL:

```text
https://cloud.example.com/remote.php/dav/files/username/
```

Use a dedicated Nextcloud app password. The Docker host must reach this public HTTPS hostname. Private and local destination addresses are intentionally rejected to prevent server-side request forgery. Generic WebDAV remains available, but its streamed PUT fallback cannot resume an interrupted file transfer.

TailCache writes new backups under `tailcache/v2/`. File objects are content-addressed and append-only; only the latest manifest and archive pointers are overwritten after all immutable objects succeed.

## Incident checklist

1. In Sync Activity, a job queued for more than two minutes reports that the worker may be offline.
2. Run `docker compose ps` and confirm the `worker` service is running; use `docker compose logs --tail=200 worker` for the job/run ID.
3. Confirm `DATABASE_URL`, source storage settings, and the encryption key are identical in `app` and `worker`.
4. Confirm the worker database role can access the `pgboss` schema.
5. Review the redacted `failureCode` and HTTP status in Sync Activity/logs. Do not paste destination passwords or Authorization headers into issue reports.
