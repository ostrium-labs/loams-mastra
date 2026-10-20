#!/usr/bin/env bash
# Starts the release's Loams Postgres development stack (loams-postgres-dev) and waits for
# compute1 on 127.0.0.1:55433. Exports POSTGRES_* and DB_URL for Mastra's pg suites.
#   LOAMS_COMPOSE_DIR      the unpacked loams-compose-<version> (install-loams.sh sets it)
#   LOAMS_PG_PROJECT       the compose project (default loams-mastra-conformance)
#   LOAMS_PG_HOST/PORT/USER/PASSWORD/DB  reuse an already running Loams Postgres instead
set -euo pipefail
source "$(dirname "$0")/lib.sh"

host="${LOAMS_PG_HOST:-127.0.0.1}" port="${LOAMS_PG_PORT:-55433}"
user="${LOAMS_PG_USER:-cloud_admin}" password="${LOAMS_PG_PASSWORD:-cloud_admin}" db="${LOAMS_PG_DB:-postgres}"

if [[ -z "${LOAMS_PG_PORT:-}" ]]; then
  dir="${LOAMS_COMPOSE_DIR:?run install-loams.sh first}/loams-postgres-dev"
  docker compose -p "${LOAMS_PG_PROJECT:-loams-mastra-conformance}" -f "$dir/compose.yaml" up -d --quiet-pull
fi

ready=false
for _ in $(seq 1 180); do
  if PGPASSWORD="$password" psql -h "$host" -p "$port" -U "$user" -d "$db" -Atqc 'select 1' >/dev/null 2>&1; then
    ready=true
    break
  fi
  sleep 1
done
if ! $ready; then
  echo "start-postgres: Loams Postgres did not accept connections on $host:$port within 180 s" >&2
  [[ -n "${dir:-}" ]] && docker compose -p "${LOAMS_PG_PROJECT:-loams-mastra-conformance}" -f "$dir/compose.yaml" logs --tail 200 >&2
  exit 1
fi
export_env POSTGRES_HOST "$host"
export_env POSTGRES_PORT "$port"
export_env POSTGRES_USER "$user"
export_env POSTGRES_PASSWORD "$password"
export_env POSTGRES_DB "$db"
export_env DB_URL "postgresql://$user:$password@$host:$port/$db"
PGPASSWORD="$password" psql -h "$host" -p "$port" -U "$user" -d "$db" -Atqc \
  "select 'Loams Postgres ' || current_setting('server_version') || ', pgvector ' || coalesce((select default_version from pg_available_extensions where name = 'vector'), 'missing')"
