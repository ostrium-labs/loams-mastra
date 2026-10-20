#!/usr/bin/env bash
# Starts Loams Durable (`loams dev` from the Loams 0.1.0 release image, whose build
# carries the durable feature) with its Resonate listener on 127.0.0.1:8001, and waits
# until it answers. Run again after `docker kill`, it restarts the same container on the
# same data directory (the crash test does this). Every listener is on loopback; the
# other services are off or on unused ports.
#
# The release .deb that test/conformance/loams/install-loams.sh installs is built without
# the durable feature (https://github.com/ostrium-labs/loams/issues/925), so this uses the
# image until a package with Durable ships.
set -euo pipefail
container="${CONTAINER:-docker}"
name="${LOAMS_CONTAINER:-mastra-resonate-loams}"
image="ghcr.io/ostrium-labs/loams:0.1.0@sha256:bbe6b967c4b15ad697a09f701e97076771aee6311f5e8310e58198be8f7f251d"
port="${LOAMS_DURABLE_PORT:-8001}"
# Loams' other listeners, on loopback ports CI does not use (override locally if taken).
http_port="${LOAMS_HTTP_PORT:-18080}"
pg_port="${LOAMS_PG_PORT:-15432}"
mysql_port="${LOAMS_MYSQL_PORT:-13306}"
grpc_port="${LOAMS_GRPC_PORT:-18090}"
git_port="${LOAMS_GIT_PORT:-18091}"
url="http://127.0.0.1:$port"

if "$container" container inspect "$name" >/dev/null 2>&1; then
  "$container" start "$name" >/dev/null
else
  "$container" run -d --name "$name" --network host "$image" dev \
    --data-dir /var/lib/loams \
    --listen "127.0.0.1:$http_port" \
    --durable-listen "127.0.0.1:$port" \
    --pg-listen "127.0.0.1:$pg_port" \
    --mysql-listen "127.0.0.1:$mysql_port" \
    --stream-grpc-listen "127.0.0.1:$grpc_port" \
    --git-listen "127.0.0.1:$git_port" \
    --no-graph --no-qdrant --no-es --no-flight-sql >/dev/null
fi

for _ in $(seq 1 240); do
  code="$(curl -s -o /dev/null -w '%{http_code}' -X POST "$url/" -H 'content-type: application/json' \
    -d '{"kind":"promise.get","head":{"corrId":"probe","version":"2026-04-01"},"data":{"id":"probe"}}' || true)"
  if [ "$code" = "404" ] || [ "$code" = "200" ]; then
    echo "RESONATE_URL=$url" >> "${GITHUB_ENV:-/dev/null}"
    echo "Loams Durable is up at $url"
    exit 0
  fi
  sleep 0.5
done
echo "Loams Durable did not start" >&2
"$container" logs "$name" >&2 || true
exit 1
