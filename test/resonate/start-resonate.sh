#!/usr/bin/env bash
# Starts the upstream Resonate server (packages/resonate/docker-compose.yaml) on
# 127.0.0.1:8001 and waits until it answers. Exports RESONATE_URL to later CI steps.
set -euo pipefail
root="$(cd "$(dirname "$0")/../.." && pwd)"
container="${CONTAINER:-docker}"
"$container" compose -f "$root/packages/resonate/docker-compose.yaml" up -d
url="http://127.0.0.1:8001"
for _ in $(seq 1 120); do
  if curl -sf -o /dev/null -X POST "$url/" -H 'content-type: application/json' \
    -d '{"kind":"promise.get","head":{"corrId":"probe","version":"2026-04-01"},"data":{"id":"probe"}}' ||
    [ "$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url/" -H 'content-type: application/json' \
      -d '{"kind":"promise.get","head":{"corrId":"probe","version":"2026-04-01"},"data":{"id":"probe"}}')" = "404" ]; then
    echo "RESONATE_URL=$url" >> "${GITHUB_ENV:-/dev/null}"
    echo "upstream Resonate is up at $url"
    exit 0
  fi
  sleep 0.5
done
echo "upstream Resonate did not start" >&2
"$container" compose -f "$root/packages/resonate/docker-compose.yaml" logs >&2 || true
exit 1
