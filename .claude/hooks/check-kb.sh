#!/usr/bin/env bash
# Runs after any edit. Routes by the file that was actually edited:
#
#   site/**/*.html         → per-page structural lint (kb.mjs validate --file, ~50ms,
#                            names the exact page and problem), then the whole-graph
#                            safety net (make check, ~0.8s)
#   scripts/** or Makefile → make check (a model/build edit can invalidate every page)
#   site/assets/*          → nothing (presentation cannot break validity)
#
# Reads the hook payload on stdin; exits 2 to surface a problem back to Claude.
set -uo pipefail

payload=$(cat 2>/dev/null || true)
cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0

# Pull the edited path out of the JSON payload without depending on jq.
file=$(printf '%s' "$payload" | node -e '
  let d = "";
  process.stdin.on("data", (c) => (d += c));
  process.stdin.on("end", () => {
    try { console.log(JSON.parse(d).tool_input?.file_path ?? ""); } catch { console.log(""); }
  });' 2>/dev/null || true)
[ -z "$file" ] && exit 0

remind() {
  echo "" >&2
  echo "Reminders: the pages are the source of truth — regenerate with 'make all'." >&2
  echo "Never hand-edit a <!-- kb:generated --> region. Tags must come from TAGS in scripts/lib/model.mjs." >&2
  echo "A relationship must be declared on BOTH pages it joins (kb.mjs link does both sides)." >&2
}

case "$file" in
  */site/assets/*) exit 0 ;;   # presentation layer — validity is unaffected
  */site/*.html)
    out=$(node scripts/kb.mjs validate --file "$file" 2>&1)
    if [ $? -ne 0 ]; then
      echo "kb.mjs validate FAILED for this page:" >&2
      echo "$out" | head -12 >&2
      remind
      exit 2
    fi
    out=$(make check 2>&1)
    if [ $? -ne 0 ]; then
      echo "page is structurally valid but make check FAILED (graph/derived artifacts):" >&2
      echo "$out" | grep -iE 'error|stale|dangling|discrepanc|one-way|not in the closed|missing|unexpected' | head -12 >&2
      remind
      exit 2
    fi
    exit 0
    ;;
  */scripts/*.mjs|*/Makefile)
    out=$(make check 2>&1)
    if [ $? -ne 0 ]; then
      echo "make check FAILED after editing build tooling:" >&2
      echo "$out" | grep -iE 'error|stale|dangling|discrepanc|one-way|not in the closed|missing|unexpected' | head -12 >&2
      remind
      exit 2
    fi
    exit 0
    ;;
  *) exit 0 ;;
esac
