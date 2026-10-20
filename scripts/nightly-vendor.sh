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
declare -A v
for p in core pg qdrant elasticsearch memory; do v[$p]=$(version "@mastra/$p"); done
echo "Mastra $tag: core ${v[core]}, pg ${v[pg]}, qdrant ${v[qdrant]}, elasticsearch ${v[elasticsearch]}, memory ${v[memory]}"

node -e '
const fs = require("fs"); const f = "test/conformance/pins.json";
const p = JSON.parse(fs.readFileSync(f, "utf8"));
const [core, pg, qdrant, es, memory] = process.argv.slice(1);
Object.assign(p.mastra, { "@mastra/core": core, "@mastra/pg": pg, "@mastra/qdrant": qdrant, "@mastra/elasticsearch": es, "@mastra/memory": memory });
p.tags = { "@mastra/pg": `@mastra/pg@${pg}`, "@mastra/qdrant": `@mastra/qdrant@${qdrant}`, "@mastra/elasticsearch": `@mastra/elasticsearch@${es}` };
fs.writeFileSync(f, JSON.stringify(p, null, 2) + "\n");
' "${v[core]}" "${v[pg]}" "${v[qdrant]}" "${v[elasticsearch]}" "${v[memory]}"

rm -rf test/conformance/upstream/mastra-*
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
} | tee -a "${GITHUB_ENV:-/dev/null}"
