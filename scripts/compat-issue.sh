#!/usr/bin/env bash
# Modelled on ostrium-labs/loams@d8bda64b2fe20a752d602b6d7b36b8cfcf1ae476:scripts/ci/sdk-nightly-issue.sh (Apache-2.0).
# A nightly conformance failure opens one issue per Mastra dist-tag and version, or comments
# on the one already open, labelled mastra-compat, listing the unexpected failures from
# test/conformance/results/*.json. GH_TOKEN is the workflow's GITHUB_TOKEN.
#
#   scripts/compat-issue.sh <dist-tag> <mastra version> <loams version>
set -euo pipefail
dist="${1:?usage: compat-issue.sh <dist-tag> <mastra version> <loams version>}"
mastra="${2:?}" loams="${3:?}"
: "${GH_TOKEN:?}" "${GITHUB_REPOSITORY:?}" "${GITHUB_SERVER_URL:?}" "${GITHUB_RUN_ID:?}"

title="Mastra ${dist} ${mastra} fails against Loams ${loams}"
run_url="${GITHUB_SERVER_URL}/${GITHUB_REPOSITORY}/actions/runs/${GITHUB_RUN_ID}"
failures=$(node -e '
const fs = require("fs"); const dir = "test/conformance/results"; const out = [];
for (const f of fs.existsSync(dir) ? fs.readdirSync(dir) : []) {
  if (!f.endsWith(".json")) continue;
  const r = JSON.parse(fs.readFileSync(`${dir}/${f}`, "utf8"));
  for (const t of r.unexpected?.failures ?? []) out.push(`- \`${r.suite ?? f}\`: ${typeof t === "string" ? t : t.test}`);
  for (const t of r.unexpected?.passes ?? []) out.push(`- \`${r.suite ?? f}\` (now passes; shrink the list): ${typeof t === "string" ? t : t.test}`);
}
console.log(out.join("\n") || "- (no results file; see the run)");
')
body="The nightly conformance run failed: ${run_url}

${failures}"

gh label create mastra-compat --repo "$GITHUB_REPOSITORY" --color 5319e7 >/dev/null 2>&1 || true
number="$(gh issue list --repo "$GITHUB_REPOSITORY" --state open --label mastra-compat --json number,title \
  --jq "map(select(.title == \"${title}\")) | .[0].number // empty")"
if [[ -n "$number" ]]; then
  gh issue comment "$number" --repo "$GITHUB_REPOSITORY" --body "$body"
else
  gh issue create --repo "$GITHUB_REPOSITORY" --title "$title" --label mastra-compat \
    --body "${body}

Opened and updated by \`scripts/compat-issue.sh\`. Close it when the nightly passes again."
fi
