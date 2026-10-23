#!/usr/bin/env bash
# The nightly `latest` and `alpha` cells (plan MA1 Task 10): replace the pinned vendored suites
# with Mastra's suites at the release tags of a dist-tag, point pins.json, the conformance
# package and the examples at those versions, and export where the suites now are. CI only:
# it edits the checkout and never commits.
#
#   scripts/nightly-vendor.sh <latest|alpha>
set -euo pipefail
tag="${1:?usage: nightly-vendor.sh <latest|alpha>}"
root="$(cd "$(dirname "$0")/.." && pwd)"
cd "$root"

version() { npm view "$1@$tag" version 2>/dev/null || npm view "$1@latest" version; }
# A package whose suites are vendored needs a release tag upstream. Mastra does not tag
# alpha releases, so fall back to the latest release for it (2026-10-22: pg 1.32.0-alpha.6
# had no tag and the cell failed before running anything).
tagged_version() {
  local v; v=$(version "$1")
  if gh api "repos/mastra-ai/mastra/git/ref/tags/$(printf '%s' "$1@$v" | sed 's/@/%40/g')" >/dev/null 2>&1; then
    echo "$v"
  else
    echo "nightly-vendor: $1@$v has no release tag in mastra-ai/mastra; using $1@latest" >&2
    npm view "$1@latest" version
  fi
}
declare -A v
for p in core memory; do v[$p]=$(version "@mastra/$p"); done
for p in pg qdrant elasticsearch; do v[$p]=$(tagged_version "@mastra/$p"); done
echo "Mastra $tag: core ${v[core]}, pg ${v[pg]}, qdrant ${v[qdrant]}, elasticsearch ${v[elasticsearch]}, memory ${v[memory]}"

node -e '
const fs = require("fs"); const f = "test/conformance/pins.json";
const p = JSON.parse(fs.readFileSync(f, "utf8"));
const [core, pg, qdrant, es, memory] = process.argv.slice(1);
Object.assign(p.mastra, { "@mastra/core": core, "@mastra/pg": pg, "@mastra/qdrant": qdrant, "@mastra/elasticsearch": es, "@mastra/memory": memory });
p.tags = { "@mastra/pg": `@mastra/pg@${pg}`, "@mastra/qdrant": `@mastra/qdrant@${qdrant}`, "@mastra/elasticsearch": `@mastra/elasticsearch@${es}` };
fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
' "${v[core]}" "${v[pg]}" "${v[qdrant]}" "${v[elasticsearch]}" "${v[memory]}"

# Only the store suites are replaced; mastra-inngest (the Resonate engine tests) stays.
rm -rf test/conformance/upstream/mastra-pg@* test/conformance/upstream/mastra-qdrant@* test/conformance/upstream/mastra-elasticsearch@*
for p in pg qdrant elasticsearch; do
  node scripts/vendor-upstream.mjs --package "@mastra/$p" --tag "@mastra/$p@${v[$p]}"
done

want=$(printf '{"@mastra/core":"%s","@mastra/pg":"%s","@mastra/qdrant":"%s","@mastra/memory":"%s"}' \
  "${v[core]}" "${v[pg]}" "${v[qdrant]}" "${v[memory]}")
for dir in examples/* templates/* test/conformance; do
  [[ -f "$dir/package.json" ]] || continue
  node -e '
const fs = require("fs"); const f = process.argv[1] + "/package.json";
const pkg = JSON.parse(fs.readFileSync(f, "utf8")); const want = JSON.parse(process.argv[2]);
for (const field of ["dependencies", "devDependencies"])
  for (const name of Object.keys(pkg[field] ?? {})) if (want[name]) pkg[field][name] = want[name];
fs.writeFileSync(f, JSON.stringify(pkg, null, 2) + "\n");
' "$dir" "$want"
done

dir_of() { ls -d "$root"/test/conformance/upstream/mastra-"$1"@*/stores/"$1"; }
{
  echo "COMPAT_QDRANT_DIR=$(dir_of qdrant)"
  echo "COMPAT_PG_DIR=$(dir_of pg)"
  echo "COMPAT_ES_DIR=$(dir_of elasticsearch)"
  echo "MASTRA_VERSION=${v[core]}"
  # Releases of the latest and alpha tags are younger than minimumReleaseAge; pnpm checks
  # the lockfile again on every `pnpm run`, not only on install (2026-10-23).
  echo "pnpm_config_minimum_release_age=0"
} | tee -a "${GITHUB_ENV:-/dev/null}"
