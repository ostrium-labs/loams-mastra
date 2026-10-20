# Shared settings for the Loams harness. Sourced, not run.
# Everything binds to loopback. Locally, set LOAMS_HARNESS_DIR (never a public host).
here="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd)"
conformance="$(cd "$here/.." && pwd)"
HARNESS_DIR="${LOAMS_HARNESS_DIR:-${RUNNER_TEMP:-$conformance/.harness}}"
mkdir -p "$HARNESS_DIR"
pins_get() { # pins_get <js expression on the pins object>
  node -e "const p=require(process.argv[1]); const v=($1); if (v===undefined) process.exit(3); console.log(v)" "$conformance/pins.json"
}
LOAMS_VERSION="${LOAMS_VERSION:-$(pins_get 'p.loams.version')}"
QDRANT_LISTEN="${LOAMS_QDRANT_LISTEN:-127.0.0.1:6333}"
ES_LISTEN="${LOAMS_ES_LISTEN:-127.0.0.1:9200}"
DURABLE_LISTEN="${LOAMS_DURABLE_LISTEN:-127.0.0.1:8001}"
API_LISTEN="${LOAMS_LISTEN:-127.0.0.1:8080}"
export_env() { # export_env NAME VALUE: to this shell and, in Actions, to later steps
  export "$1=$2"
  if [[ -n "${GITHUB_ENV:-}" ]]; then echo "$1=$2" >> "$GITHUB_ENV"; fi
}
