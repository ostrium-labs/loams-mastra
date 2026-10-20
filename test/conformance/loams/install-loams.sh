#!/usr/bin/env bash
# Installs the pinned Loams release: the .deb (loams dev) and the compose tarball (Loams
# Postgres). Checks every file against SHA256SUMS and against test/conformance/pins.json.
#   LOAMS_RELEASE_DIR  use already-downloaded files instead of downloading
set -euo pipefail
source "$(dirname "$0")/lib.sh"
LOAMS_VERSION="${LOAMS_VERSION:-$(pins_get 'p.loams.version')}"

deb="loams_${LOAMS_VERSION}_amd64.deb"
tarball="loams-compose-${LOAMS_VERSION}.tar.gz"
dl="${LOAMS_RELEASE_DIR:-$HARNESS_DIR/release}"
mkdir -p "$dl"
if [[ -z "${LOAMS_RELEASE_DIR:-}" ]]; then
  base="https://github.com/ostrium-labs/loams/releases/download/v${LOAMS_VERSION}"
  for f in SHA256SUMS "$deb" "$tarball"; do
    curl -fsSL --retry 3 -o "$dl/$f" "$base/$f"
  done
fi

verify() { # verify <file> <pinned sha256>
  local f=$1 pinned=$2 listed actual
  listed=$(awk -v f="$f" '$2 == f || $2 == "*"f { print $1 }' "$dl/SHA256SUMS")
  actual=$(sha256sum "$dl/$f" | awk '{ print $1 }')
  if [[ -z "$listed" || "$actual" != "$listed" ]]; then
    echo "install-loams: $f does not match SHA256SUMS (got $actual, listed ${listed:-nothing})" >&2
    exit 1
  fi
  if [[ "$actual" != "$pinned" ]]; then
    echo "install-loams: $f does not match pins.json (got $actual, pinned $pinned)" >&2
    exit 1
  fi
}
verify "$deb" "$(pins_get 'p.loams.deb_sha256')"
verify "$tarball" "$(pins_get 'p.loams.compose_sha256')"

if [[ "$(id -u)" == 0 ]]; then
  dpkg -i "$dl/$deb" >/dev/null
  bin=/usr/bin/loams
else
  rm -rf "$HARNESS_DIR/loams"
  mkdir -p "$HARNESS_DIR/loams"
  if command -v dpkg-deb >/dev/null; then
    dpkg-deb -x "$dl/$deb" "$HARNESS_DIR/loams"
  else # not Debian: unpack the ar archive's data member by hand
    x="$HARNESS_DIR/deb-extract"
    rm -rf "$x" && mkdir -p "$x"
    (cd "$x" && ar x "$dl/$deb")
    tar -xf "$x"/data.tar.* -C "$HARNESS_DIR/loams"
    rm -rf "$x"
  fi
  bin="$HARNESS_DIR/loams/usr/bin/loams"
fi
rm -rf "$HARNESS_DIR/loams-compose"
mkdir -p "$HARNESS_DIR/loams-compose"
tar -xzf "$dl/$tarball" -C "$HARNESS_DIR/loams-compose"

export_env LOAMS_BIN "$bin"
export_env LOAMS_COMPOSE_DIR "$HARNESS_DIR/loams-compose/loams-compose-${LOAMS_VERSION}"
"$bin" --version
