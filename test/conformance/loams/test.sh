#!/usr/bin/env bash
# start_loams_refuses_bad_checksum: install-loams.sh must refuse a release file whose
# SHA-256 doesn't match SHA256SUMS or pins.json.
set -euo pipefail
here="$(cd "$(dirname "$0")" && pwd)"
work="$(mktemp -d "${RUNNER_TEMP:-$here/..}/harness-test.XXXXXX")"
trap 'rm -rf "$work"' EXIT

mkdir -p "$work/conformance/loams" "$work/release"
cp "$here"/*.sh "$work/conformance/loams/"
echo 'not really a deb' > "$work/release/loams_9.9.9_amd64.deb"
echo 'not really a tarball' > "$work/release/loams-compose-9.9.9.tar.gz"
(cd "$work/release" && sha256sum loams_9.9.9_amd64.deb loams-compose-9.9.9.tar.gz > SHA256SUMS)
deb_sha=$(sha256sum "$work/release/loams_9.9.9_amd64.deb" | cut -d' ' -f1)
tar_sha=$(sha256sum "$work/release/loams-compose-9.9.9.tar.gz" | cut -d' ' -f1)
printf '{"loams":{"version":"9.9.9","deb_sha256":"%s","compose_sha256":"%s"}}\n' "$deb_sha" "$tar_sha" \
  > "$work/conformance/pins.json"

run() { LOAMS_RELEASE_DIR="$work/release" LOAMS_HARNESS_DIR="$work/h" GITHUB_ENV= \
  bash "$work/conformance/loams/install-loams.sh" >/dev/null 2>&1; }

# A corrupted byte in the .deb: refused (exit 1) before anything is installed.
printf 'X' | dd of="$work/release/loams_9.9.9_amd64.deb" bs=1 seek=0 conv=notrunc status=none
if run; then echo "start_loams_refuses_bad_checksum: a corrupted .deb was accepted" >&2; exit 1; fi
[[ ! -e "$work/h/loams" ]] || { echo "start_loams_refuses_bad_checksum: installed anyway" >&2; exit 1; }

# SHA256SUMS agrees with the corrupted file, but pins.json does not: still refused.
(cd "$work/release" && sha256sum loams_9.9.9_amd64.deb loams-compose-9.9.9.tar.gz > SHA256SUMS)
if run; then echo "start_loams_refuses_bad_checksum: a file off pins.json was accepted" >&2; exit 1; fi

echo 'start_loams_refuses_bad_checksum: ok'
