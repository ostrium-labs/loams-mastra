#!/usr/bin/env bash
# Starts `loams dev` on loopback: Qdrant 127.0.0.1:6333, Elasticsearch 127.0.0.1:9200,
# Durable 127.0.0.1:8001 (override with LOAMS_QDRANT_LISTEN etc. for a local run).
#   --auth   LOAMS_AUTH_MODE=apikey with a throwaway lk_ key, exported as LOAMS_API_KEY
#   LOAMS_DEV_ARGS  extra `loams dev` flags (e.g. other loopback ports when the defaults are taken)
#   LOAMS_BIN  the loams binary (default: install-loams.sh's, else `loams` on PATH)
set -euo pipefail
source "$(dirname "$0")/lib.sh"

auth=false
[[ "${1:-}" == "--auth" ]] && auth=true
bin="${LOAMS_BIN:-$(command -v loams || true)}"
[[ -x "$bin" ]] || { echo "start-loams: no loams binary (run install-loams.sh or set LOAMS_BIN)" >&2; exit 1; }

data="$HARNESS_DIR/loams-data"
rm -rf "$data"
mkdir -p "$data"
env_args=()
if $auth; then
  keys="$HARNESS_DIR/loams-keys"
  rm -f "$keys"
  key=$("$bin" auth new-key --label conformance --append "$keys" 2>/dev/null)
  [[ "$key" == lk_* ]] || { echo "start-loams: could not mint a key" >&2; exit 1; }
  if [[ -n "${GITHUB_ACTIONS:-}" ]]; then echo "::add-mask::$key"; fi
  export_env LOAMS_API_KEY "$key"
  env_args=(LOAMS_AUTH_MODE=apikey "LOAMS_API_KEYS_FILE=$keys")
fi

env "${env_args[@]}" "$bin" dev --data-dir "$data" --listen "$API_LISTEN" \
  --qdrant-listen "$QDRANT_LISTEN" --es-listen "$ES_LISTEN" --durable-listen "$DURABLE_LISTEN" \
  ${LOAMS_DEV_ARGS:-} \
  > "$HARNESS_DIR/loams.log" 2>&1 &
echo $! > "$HARNESS_DIR/loams.pid"

for _ in $(seq 1 120); do
  # Any HTTP answer means it is up (with --auth, GET / without a key is 401).
  code=$(curl -s -o /dev/null -w '%{http_code}' "http://$QDRANT_LISTEN/" || true)
  if [[ "$code" != 000 ]]; then
    export_env LOAMS_QDRANT_URL "http://$QDRANT_LISTEN"
    export_env LOAMS_ES_URL "http://$ES_LISTEN"
    export_env LOAMS_URL "http://$API_LISTEN"
    echo "loams dev is up (auth: $auth)"
    exit 0
  fi
  kill -0 "$(cat "$HARNESS_DIR/loams.pid")" 2>/dev/null || break
  sleep 0.5
done
echo "start-loams: loams dev did not answer on http://$QDRANT_LISTEN/ within 60 s" >&2
tail -n 200 "$HARNESS_DIR/loams.log" >&2
exit 1
