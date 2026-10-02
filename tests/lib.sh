#!/usr/bin/env bash
# Assertions and sandbox helpers for the bash test suite (the hooks' tests).
#
# NOT standalone — source it from a `*.test.sh` file:
#     . "$(dirname "$0")/../lib.sh"
#
# Deliberately no `set -e`: a test file keeps going after a failed assertion so
# one run reports every failure instead of only the first. Assertions therefore
# always return 0; the exit status comes from the EXIT trap installed here.
#
# Every failure prints two lines on stderr, which the tests-bash gate
# (tools/src/gates/check-bash-suite.ts) reads back into findings:
#     "  FAIL <label>"
#     "       at <file>:<line>"
# and a passing file ends with "  — N assertion(s) passed" on stdout.
# shellcheck shell=bash

KB_TESTS_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")" && pwd -P)"
KB_REPO_ROOT="$(cd "$KB_TESTS_DIR/.." && pwd -P)"

TESTS_RUN=0
TESTS_FAILED=0
SANDBOXES=""
SANDBOX=""
STATUS=0
# shellcheck disable=SC2034  # every test file reads $OUTPUT after capture
OUTPUT=""
# shellcheck disable=SC2034  # both are read by test files after capture_split
STDOUT=""
# shellcheck disable=SC2034
STDERR=""

# ---------------------------------------------------------------------------
# Which bash the scripts under test run under
# ---------------------------------------------------------------------------
# `bash` on PATH by default. KB_TEST_BASH names another one — /bin/bash on
# macOS is the stock 3.2, the oldest bash a hook meets on a contributor's
# machine. It is a PATH shim rather than a variable each helper remembers to
# use, because a hook runs through its own `#!/usr/bin/env bash`, which reads
# PATH.
if [ -n "${KB_TEST_BASH:-}" ]; then
  case "$KB_TEST_BASH" in
    /*) : ;;
    *)
      echo "  FAIL harness: KB_TEST_BASH must be an absolute path (got '$KB_TEST_BASH')" >&2
      exit 2
      ;;
  esac
  if [ ! -x "$KB_TEST_BASH" ]; then
    echo "  FAIL harness: KB_TEST_BASH is not an executable: $KB_TEST_BASH" >&2
    exit 2
  fi
  # Inherited from tests/run.sh when the suite made one; a file run on its own
  # makes and cleans its own.
  if [ -z "${KB_TEST_BASH_SHIM:-}" ]; then
    KB_TEST_BASH_SHIM="$(cd "$(mktemp -d)" && pwd -P)"
    SANDBOXES="$SANDBOXES $KB_TEST_BASH_SHIM"
    export KB_TEST_BASH_SHIM
  fi
  ln -sfn "$KB_TEST_BASH" "$KB_TEST_BASH_SHIM/bash"
  case ":$PATH:" in
    *":$KB_TEST_BASH_SHIM:"*) : ;;
    *) PATH="$KB_TEST_BASH_SHIM:$PATH" ;;
  esac
  export PATH KB_TEST_BASH
fi

# The machine's own tools, as the suite found them — after the shim, so the
# chosen bash is in it. `path_without` picks real binaries off this shelf.
KB_ORIG_PATH="$PATH"

# The interpreter to launch a script under test with, for the calls that name one.
KB_BASH="${KB_TEST_BASH:-bash}"

# ---------------------------------------------------------------------------
# Reporting
# ---------------------------------------------------------------------------
_pass() {
  TESTS_RUN=$((TESTS_RUN + 1))
  echo "  ok   $1"
}

# Where in the test file the failing case was written: the outermost call in
# that file. A case often reaches its assertion through the file's own helpers
# (`assert_denied` → `guard` → `assert_hook_denied`), and the innermost frame
# outside this file would name the helper's line for every case alike.
_where() {
  local i=1 at=""
  while [ "$i" -lt "${#BASH_SOURCE[@]}" ]; do
    case "${BASH_SOURCE[$i]}" in
      */lib.sh) : ;;
      *) at="${BASH_SOURCE[$i]#"$KB_REPO_ROOT"/}:${BASH_LINENO[$((i - 1))]}" ;;
    esac
    i=$((i + 1))
  done
  printf '%s' "${at:-unknown}"
}

# A long actual value, trimmed from the middle: the end is the half worth
# keeping, because a script prints its summary last. KB_TEST_CONTEXT sets the
# budget in lines.
_excerpt() { # <text>
  local max lines half
  max="${KB_TEST_CONTEXT:-20}"
  lines="$(printf '%s\n' "$1" | wc -l | tr -d ' ')"
  if [ "$lines" -le "$max" ]; then printf '%s' "$1"; return 0; fi
  half=$((max / 2))
  printf '%s\n… %s more line(s) …\n%s' \
    "$(printf '%s\n' "$1" | head -n "$half")" \
    "$((lines - 2 * half))" \
    "$(printf '%s\n' "$1" | tail -n "$half")"
}

_fail() {
  local label="$1"; shift
  TESTS_RUN=$((TESTS_RUN + 1))
  TESTS_FAILED=$((TESTS_FAILED + 1))
  echo "  FAIL $label" >&2
  echo "       at $(_where)" >&2
  while [ $# -gt 0 ]; do
    printf '%s\n' "$1" | while IFS= read -r _line; do echo "       $_line" >&2; done
    shift
  done
}

_finish() {
  local rc=$?
  if [ "${KB_TEST_KEEP:-0}" != "1" ]; then
    for d in $SANDBOXES; do
      case "$d" in /*) rm -rf "$d" ;; esac
    done
  fi
  # A crash before the last assertion is a failure even if nothing asserted.
  if [ "$rc" -ne 0 ] && [ "$TESTS_FAILED" -eq 0 ]; then
    echo "  FAIL harness: the test file exited $rc before finishing" >&2
    TESTS_FAILED=1
  fi
  # A file that asserted nothing is not a passing file: gutting a test file,
  # or an `exit 0` left behind while debugging one, must not read as green.
  if [ "$rc" -eq 0 ] && [ "$TESTS_RUN" -eq 0 ]; then
    echo "  FAIL harness: the file ran no assertions" >&2
    TESTS_FAILED=1
  fi
  if [ "$TESTS_FAILED" -gt 0 ]; then
    echo "  — $TESTS_FAILED of $TESTS_RUN assertion(s) failed" >&2
    exit 1
  fi
  echo "  — $TESTS_RUN assertion(s) passed"
  exit 0
}
trap _finish EXIT

# ---------------------------------------------------------------------------
# Assertions
# ---------------------------------------------------------------------------
assert_equal() { # <expected> <actual> <label>
  if [ "$1" = "$2" ]; then _pass "$3"; else _fail "$3" "expected: $1" "actual:   $2"; fi
  return 0
}

assert_contains() { # <haystack> <needle> <label>
  case "$1" in
    *"$2"*) _pass "$3" ;;
    *) _fail "$3" "expected to contain: $2" "actual:" "$(_excerpt "$1")" ;;
  esac
  return 0
}

assert_not_contains() { # <haystack> <needle> <label>
  case "$1" in
    *"$2"*) _fail "$3" "expected NOT to contain: $2" "actual:" "$(_excerpt "$1")" ;;
    *) _pass "$3" ;;
  esac
  return 0
}

# An extended regular expression, the dialect grep -E takes.
assert_matches() { # <text> <ere> <label>
  if printf '%s' "$1" | grep -Eq "$2"; then
    _pass "$3"
  else
    _fail "$3" "expected to match: $2" "actual:" "$(_excerpt "$1")"
  fi
  return 0
}

assert_exit() { # <expected-status> <label> — checks $STATUS from the last capture
  assert_equal "$1" "$STATUS" "$2"
}

assert_file() { # <path> <label>
  if [ -f "$1" ]; then _pass "$2"; else _fail "$2" "no such file: $1"; fi
  return 0
}

assert_executable() { # <path> <label>
  if [ -x "$1" ]; then _pass "$2"; else _fail "$2" "not executable: $1"; fi
  return 0
}

# ---------------------------------------------------------------------------
# What a hook decided
# ---------------------------------------------------------------------------
# Every hook answers in one of three shapes — a deny, an advisory, or silence —
# and each shape is several assertions, read from the $OUTPUT and $STATUS a
# hook run left behind.

# Whether $OUTPUT is one JSON object for which the jq filter holds. The
# runtime reads fields by key, so a right word under a wrong key is no answer.
_output_is() { # <jq filter> [jq args...]
  local filter="$1"
  shift
  printf '%s' "$OUTPUT" | jq -e -s "length == 1 and (.[0] | type == \"object\") and (.[0] | $filter)" "$@" >/dev/null 2>&1
}

# A PreToolUse deny, and the way out it must name, each under the key the
# runtime reads.
assert_hook_denied() { # <label> [needle]
  assert_exit 0 "$1: exits 0 — a deny is a decision, not a failure"
  if _output_is '.hookSpecificOutput.hookEventName == "PreToolUse" and .hookSpecificOutput.permissionDecision == "deny"'; then
    _pass "$1: one PreToolUse deny object"
  else
    _fail "$1: one PreToolUse deny object" "actual:" "$(_excerpt "$OUTPUT")"
  fi
  if [ $# -ge 2 ]; then
    if _output_is '(.hookSpecificOutput.permissionDecisionReason | type == "string") and (.hookSpecificOutput.permissionDecisionReason | contains($n))' --arg n "$2"; then
      _pass "$1: says what to run instead"
    else
      _fail "$1: says what to run instead" "expected permissionDecisionReason to contain: $2" "actual:" "$(_excerpt "$OUTPUT")"
    fi
  fi
  return 0
}

# A PostToolUse advisory: it reaches both readers, with the same text, and it
# never blocks — an advisory that blocks is not an advisory.
assert_hook_advises() { # <label> <needle>
  assert_exit 0 "$1: exits 0 — an advisory is not a failure"
  if _output_is '.hookSpecificOutput.hookEventName == "PostToolUse" and (.hookSpecificOutput.additionalContext | type == "string") and (.systemMessage | type == "string")'; then
    _pass "$1: one PostToolUse note, for the session and the person"
  else
    _fail "$1: one PostToolUse note, for the session and the person" "actual:" "$(_excerpt "$OUTPUT")"
  fi
  if _output_is '.hookSpecificOutput.additionalContext | contains($n)' --arg n "$2"; then
    _pass "$1: says what to do about it"
  else
    _fail "$1: says what to do about it" "expected additionalContext to contain: $2" "actual:" "$(_excerpt "$OUTPUT")"
  fi
  if _output_is '.hookSpecificOutput.additionalContext == .systemMessage'; then
    _pass "$1: the session and the person read the same note"
  else
    _fail "$1: the session and the person read the same note" "actual:" "$(_excerpt "$OUTPUT")"
  fi
  assert_not_contains "$OUTPUT" '"decision"' "$1: never blocks"
  return 0
}

# No opinion: exit 0 AND nothing on stdout, because a hook that prints half a
# decision is read by the session as a malformed one.
assert_hook_silent() { # <label>
  assert_exit 0 "$1: exits 0"
  assert_equal "" "$OUTPUT" "$1: says nothing"
  return 0
}

# ---------------------------------------------------------------------------
# Running things under test
# ---------------------------------------------------------------------------
# Run a command, never fail the caller, and leave stdout+stderr in $OUTPUT and
# the exit status in $STATUS.
capture() { # <cmd> [args...]
  # shellcheck disable=SC2034  # read by the sourcing test file, not by lib.sh
  OUTPUT="$("$@" 2>&1)"
  STATUS=$?
  return 0
}

# The same, with the streams kept apart, in $STDOUT and $STDERR.
capture_split() { # <cmd> [args...]
  local t
  t="$(mktemp -d)"
  "$@" >"$t/out" 2>"$t/err"
  STATUS=$?
  # shellcheck disable=SC2034  # read by the sourcing test file, not by lib.sh
  STDOUT="$(cat "$t/out")"
  # shellcheck disable=SC2034  # read by the sourcing test file, not by lib.sh
  STDERR="$(cat "$t/err")"
  rm -rf "$t"
  return 0
}

# Run a hook with <stdin> as its event, leaving its stdout in $OUTPUT and its
# status in $STATUS. Stderr is kept out: a hook's stdout is a protocol the
# runtime parses, and a test that merged a warning into it would pass on
# output no session could read.
run_hook() { # <hook-path> <stdin>
  # shellcheck disable=SC2034  # read by the sourcing test file, not by lib.sh
  OUTPUT="$(printf '%s' "$2" | "$KB_BASH" "$1" 2>/dev/null)"
  STATUS=$?
  return 0
}

# The PreToolUse payload for a Bash tool call, escaped by jq.
bash_payload() { # <command>
  jq -nc --arg c "$1" '{
    session_id: "kb-tests", cwd: ".", hook_event_name: "PreToolUse",
    tool_name: "Bash", tool_input: { command: $c }
  }'
}

# The PostToolUse payload for an edit that landed in <file>.
edit_payload() { # <file>
  jq -nc --arg f "$1" '{
    session_id: "kb-tests", hook_event_name: "PostToolUse",
    tool_name: "Edit", tool_input: { file_path: $f }
  }'
}

# Every file under a directory with its bytes, for the "it writes nothing"
# assertion every hook owes. Content, not just names: a hook that rewrote a
# file in place would pass a listing.
tree_digest() { # <dir>
  find "$1" -type f -not -path '*/.git/*' -exec shasum {} + 2>/dev/null | sort
}

# ---------------------------------------------------------------------------
# Sandboxes
# ---------------------------------------------------------------------------
# Put a directory this test made by hand on the list `_finish` deletes.
register_tmp() { # <dir>
  case "${1:-}" in
    /*) SANDBOXES="$SANDBOXES $1" ;;
    *)
      echo "  FAIL harness: register_tmp needs an absolute path (got '${1:-}')" >&2
      TESTS_FAILED=$((TESTS_FAILED + 1))
      ;;
  esac
  return 0
}

# A private HOME, a private project dir, and a git repo — so a test can never
# reach the real ~/.claude, and a hook that resolves the project root lands here.
make_sandbox() {
  local d
  d="$(cd "$(mktemp -d)" && pwd -P)"
  SANDBOXES="$SANDBOXES $d"
  SANDBOX="$d"
  unset GIT_DIR GIT_WORK_TREE GIT_INDEX_FILE
  HOME="$d/home"; export HOME
  PROJECT="$d/project"; export PROJECT
  mkdir -p "$HOME/.claude" "$PROJECT/.claude"
  CLAUDE_PROJECT_DIR="$PROJECT"; export CLAUDE_PROJECT_DIR
  cd "$PROJECT" || exit 1
  git init -q -b main .
  git config user.email "tests@kb.invalid"
  git config user.name "kb tests"
  return 0
}

# Expose a real repo path inside the sandbox by symlink, read-only by convention.
link_repo() { # <path>...
  local n
  for n in "$@"; do
    mkdir -p "$(dirname "$PROJECT/$n")"
    ln -sfn "$KB_REPO_ROOT/$n" "$PROJECT/$n"
  done
  return 0
}

# ---------------------------------------------------------------------------
# PATH control
# ---------------------------------------------------------------------------
# The tools a hook may legitimately reach for. `path_without` builds a PATH out
# of exactly these, minus the ones named — the only honest way to simulate "jq
# is not installed", because a stub named `jq` would still be found.
KB_TEST_TOOLS="awk basename cat cut dirname env find grep head jq ls mkdir mktemp printf \
pwd readlink rm sed sh shasum sort tail tr wc git bash"

KB_PATH_BEFORE_HIDE=""
KB_PATH_HIDDEN=0

path_without() { # <cmd>...
  local hide=" $* " dir="$SANDBOX/nopath" t p
  if [ "$KB_PATH_HIDDEN" -eq 0 ]; then
    KB_PATH_BEFORE_HIDE="$PATH"
    KB_PATH_HIDDEN=1
  fi
  PATH="$KB_ORIG_PATH" rm -rf "$dir"
  PATH="$KB_ORIG_PATH" mkdir -p "$dir"
  for t in $KB_TEST_TOOLS; do
    case "$hide" in *" $t "*) continue ;; esac
    p="$(PATH="$KB_ORIG_PATH" command -v "$t" 2>/dev/null || true)"
    case "$p" in /*) PATH="$KB_ORIG_PATH" ln -sf "$p" "$dir/$t" ;; esac
  done
  PATH="$dir"; export PATH
  return 0
}

# Give back the PATH that was live when `path_without` took it away.
path_restore() {
  [ "$KB_PATH_HIDDEN" -eq 1 ] || return 0
  PATH="$KB_PATH_BEFORE_HIDE"; export PATH
  KB_PATH_HIDDEN=0
  return 0
}
