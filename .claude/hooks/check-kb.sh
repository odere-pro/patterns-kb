#!/usr/bin/env bash
# Runs after any edit. If a page under site/ was touched, re-validate the KB.
#
# The pages ARE the data, so an edit to one can break the graph, the hub, the
# vocabulary, a link, or the closed tag vocabulary — none of which is visible in
# the diff you just made. `make check` takes ~0.8s, which is cheap enough to pay
# on every edit rather than discovering it in CI.
#
# Reads the hook payload on stdin; exits 2 to surface a problem back to Claude.
set -uo pipefail

payload=$(cat 2>/dev/null || true)
case "$payload" in
  *site/*.html*) ;;
  *) exit 0 ;;   # not a page — nothing to check
esac

cd "${CLAUDE_PROJECT_DIR:-.}" || exit 0
out=$(make check 2>&1)
if [ $? -ne 0 ]; then
  echo "make check FAILED after this edit:" >&2
  echo "$out" | grep -iE 'error|stale|dangling|discrepanc|one-way|not in the closed|missing|unexpected' | head -12 >&2
  echo "" >&2
  echo "Reminders: the pages are the source of truth — regenerate with 'make all'." >&2
  echo "Never hand-edit a <!-- kb:generated --> region. Tags must come from TAGS in scripts/lib/model.mjs." >&2
  echo "A relationship must be declared on BOTH pages it joins." >&2
  exit 2
fi
exit 0
