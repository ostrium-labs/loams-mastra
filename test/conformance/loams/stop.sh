#!/usr/bin/env bash
# Stops loams dev and the Loams Postgres stack this harness started. With --logs (or on a
# failed job), prints the last 200 lines of each log first. Never removes volumes it did
# not create: the compose project is the harness's own.
set -uo pipefail
source "$(dirname "$0")/lib.sh"

if [[ "${1:-}" == "--logs" ]]; then
  echo "::group::loams dev log"; tail -n 200 "$HARNESS_DIR/loams.log" 2>/dev/null; echo "::endgroup::"
fi
if [[ -f "$HARNESS_DIR/loams.pid" ]]; then
  kill "$(cat "$HARNESS_DIR/loams.pid")" 2>/dev/null
  rm -f "$HARNESS_DIR/loams.pid"
fi
if [[ -n "${LOAMS_COMPOSE_DIR:-}" && -z "${LOAMS_PG_PORT:-}" ]]; then
  dir="$LOAMS_COMPOSE_DIR/loams-postgres-dev"
  if [[ "${1:-}" == "--logs" ]]; then
    echo "::group::Loams Postgres logs"
    docker compose -p "${LOAMS_PG_PROJECT:-loams-mastra-conformance}" -f "$dir/compose.yaml" logs --tail 200
    echo "::endgroup::"
  fi
  docker compose -p "${LOAMS_PG_PROJECT:-loams-mastra-conformance}" -f "$dir/compose.yaml" down -v
fi
exit 0
