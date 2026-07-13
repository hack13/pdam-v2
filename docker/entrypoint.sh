#!/bin/sh
set -eu

if [ "${RUN_DB_MIGRATE:-false}" = "true" ]; then
  echo "[entrypoint] running database migrations"
  pnpm db:migrate
fi

exec "$@"
