#!/usr/bin/env bash
# Run the bash test suite: every tests/**/*.test.sh, each in its own process and
# its own sandbox. One line per file; the full transcript of a failing file.
#
# Usage: tests/run.sh              (everything)
#        tests/run.sh guard        (only files whose path contains "guard")
#        tests/run.sh -v           (print every assertion, not just failures)
#        tests/run.sh -j 4         (four files at a time; -j 1 is one after another)
#        tests/run.sh --pass-with-no-match guard
#                                  (a filter matching nothing is not a failure)
#
# Files run concurrently by default, as many at once as there are processors.
# Nothing is shared to make that safe: each file is its own process with its own
# sandbox, its own HOME and its own git repo. What concurrency costs is the
# order output arrives in, so each file's transcript is collected whole and the
# results are read back in the order a serial run would print them.
#
# KB_TEST_BASH=/bin/bash runs the whole suite under a chosen bash instead of
# whatever `bash` means here. macOS ships 3.2 at /bin/bash, the oldest bash a
# hook meets on a contributor's machine. tests/lib.sh puts that bash in front
# of PATH as well, so a hook run through its own `#!/usr/bin/env bash` lands on
# it too.
#
# This is the suite a person runs. The tests-bash gate
# (tools/src/gates/check-bash-suite.ts) runs this same script and turns its
# transcript into findings. Argv is validated before anything runs: an unknown
# flag must not be read as a filter and silently run nothing.
set -uo pipefail
cd "$(git rev-parse --show-toplevel)" || exit 1

RUNNER="${KB_TEST_BASH:-bash}"
if [ -n "${KB_TEST_BASH:-}" ]; then
  # One shim dir for the run, filled by tests/lib.sh and inherited by every
  # file, so each file does not make and remove its own.
  KB_TEST_BASH_SHIM="$(mktemp -d)"; export KB_TEST_BASH_SHIM
  trap 'rm -rf "$KB_TEST_BASH_SHIM"' EXIT
fi

VERBOSE=0
FILTER=""
# Whether a filter that matches no file is a failure. On its own it is:
# `tests/run.sh guard` is a request to run something, and running nothing is
# not an answer. A caller handing one filter to several suites passes
# --pass-with-no-match, the way vitest takes `--passWithNoTests`.
PASS_WITH_NO_MATCH=0
# How many processors this machine has, asked of whichever tool answers here.
# Neither exists everywhere, and a machine that answers with nothing gets one
# job rather than a runner that divides by an empty string.
_cpus() {
  if command -v sysctl >/dev/null 2>&1; then
    sysctl -n hw.ncpu 2>/dev/null && return 0
  fi
  if command -v nproc >/dev/null 2>&1; then
    nproc 2>/dev/null && return 0
  fi
  printf 1
}
JOBS="${KB_TEST_JOBS:-}"
if [ -z "$JOBS" ]; then
  JOBS="$(_cpus | head -n 1 | tr -dc '0-9')"
  [ -n "$JOBS" ] || JOBS=1
  # Past a point the limit is the git and bash processes each file spawns, not
  # the runner, and a laptop still has to be usable while the suite runs.
  [ "$JOBS" -le 8 ] || JOBS=8
fi
want_jobs=""
for arg in "$@"; do
  if [ -n "$want_jobs" ]; then
    want_jobs=""
    case "$arg" in
      ''|*[!0-9]*) echo "[tests] -j takes a whole number of jobs (got '$arg')" >&2; exit 2 ;;
    esac
    [ "$arg" -ge 1 ] || { echo "[tests] -j takes at least 1 job (got '$arg')" >&2; exit 2; }
    JOBS="$arg"
    continue
  fi
  case "$arg" in
    -v|--verbose) VERBOSE=1 ;;
    --pass-with-no-match) PASS_WITH_NO_MATCH=1 ;;
    -h|--help) sed -n '2,30p' "$0"; exit 0 ;;
    -j) want_jobs=1 ;;
    -j*)
      n="${arg#-j}"
      case "$n" in
        ''|*[!0-9]*) echo "[tests] -j takes a whole number of jobs (got '$n')" >&2; exit 2 ;;
      esac
      [ "$n" -ge 1 ] || { echo "[tests] -j takes at least 1 job (got '$n')" >&2; exit 2; }
      JOBS="$n"
      ;;
    -*) echo "[tests] unknown option: $arg" >&2; sed -n '5,10p' "$0" >&2; exit 2 ;;
    *)
      if [ -n "$FILTER" ]; then
        echo "[tests] one filter at a time (got '$FILTER' and '$arg')" >&2
        exit 2
      fi
      FILTER="$arg"
      ;;
  esac
done
[ -z "$want_jobs" ] || { echo "[tests] -j takes a whole number of jobs (got nothing)" >&2; exit 2; }

[ -f tests/lib.sh ] || { echo "[tests] tests/lib.sh is missing" >&2; exit 1; }

files=""
while IFS= read -r f; do
  [ -n "$f" ] || continue
  if [ -n "$FILTER" ]; then
    case "$f" in *"$FILTER"*) : ;; *) continue ;; esac
  fi
  files="$files $f"
done <<EOF
$(find tests -type f -name '*.test.sh' | sort)
EOF

if [ -z "$files" ]; then
  if [ -n "$FILTER" ]; then
    if [ "$PASS_WITH_NO_MATCH" -eq 1 ]; then
      echo "[tests] no test file matches '$FILTER' — nothing to run"
      exit 0
    fi
    echo "[tests] no test file matches '$FILTER'" >&2
  else
    # Never passable: an empty suite is a broken checkout, not a narrow filter.
    echo "[tests] no test files found under tests/" >&2
  fi
  exit 1
fi

total=0
failed=0
failed_list=""
started="$SECONDS"

# The version, not just the path: this line is the evidence that a run billed as
# "the floor" ran on the floor. `$BASH_VERSION` from the runner itself, because
# `--version` prints the build it was compiled as, which is not the same claim.
# shellcheck disable=SC2016  # $BASH_VERSION must expand in the child, not here
echo "== kb bash test suite (bash $("$RUNNER" -c 'printf %s "$BASH_VERSION"'), $RUNNER), $JOBS at a time =="

# Where the running files put what they said. One directory for the run, so a
# file's transcript, its exit status and its duration are three names under one
# index rather than three variables the parent has to keep straight.
WORK="$(mktemp -d)"
trap 'rm -rf "$WORK"' EXIT

# Job control, for the signals rather than for the jobs.
#
# A shell without it sets SIGINT and SIGQUIT to ignore in every background
# command, and that disposition is inherited by the file being run: the case
# asserting that Ctrl-C stops a script then reads exit 0 and passes for a
# script that ignored the signal. With job control each file gets its own
# process group and the default handlers back. `trap - INT` inside the child
# is not the same fix — it restores what the subshell inherited, which is the
# ignore, and bash 3.2 is where that difference shows.
#
# Job notices are an interactive-shell thing, so nothing is printed here.
set -m

# One file, in the background. The status file is written last and moved into
# place, so its existence means "this one is finished and everything it said is
# already on disk" — which is what the parent counts slots with. A `kill -0`
# check could not say that: a finished child is a zombie until it is waited on,
# and answers alive.
_launch() { # <index> <file>
  (
    _t0="$SECONDS"
    "$RUNNER" "$2" >"$WORK/$1.out" 2>&1
    _rc=$?
    printf '%s %s' "$_rc" "$((SECONDS - _t0))" >"$WORK/$1.tmp"
    mv "$WORK/$1.tmp" "$WORK/$1.rc"
  ) &
}

# Block until fewer than $JOBS of the ones already launched are still going.
_wait_for_slot() { # <how-many-are-already-in-flight>
  while :; do
    _done=0
    for _r in "$WORK"/*.rc; do
      [ -e "$_r" ] && _done=$((_done + 1))
    done
    [ $(($1 - _done)) -lt "$JOBS" ] && return 0
    sleep 0.1
  done
}

launched=0
for f in $files; do
  # Counted before the increment: the argument is how many are already in
  # flight, and asking about a file that has not been launched yet is a wait
  # for something nothing will ever finish.
  _wait_for_slot "$launched"
  launched=$((launched + 1))
  _launch "$launched" "$f"
done

# Read the results back in the order the files were found, whatever order they
# finished in. A run is a report, and a report that reshuffles itself by how
# fast a machine happened to be is one nobody can diff against the last one.
index=0
slowest=""
for f in $files; do
  index=$((index + 1))
  total=$((total + 1))
  while [ ! -e "$WORK/$index.rc" ]; do sleep 0.1; done
  read -r rc dt < "$WORK/$index.rc"
  out="$(cat "$WORK/$index.out")"
  slowest="$slowest$dt $f
"
  # The tally line is the evidence that tests/lib.sh's EXIT trap ran at all,
  # and `trap … EXIT` replaces rather than adds: a file that sourced a script
  # installing one of its own lost the trap, and with it the failure count, the
  # sandbox cleanup and the "this file asserted nothing" guard. It then exited
  # 0 with its failures printed above, which is the one thing a suite must not
  # be able to do. Checked here as well as there, because a file cannot hold a
  # property it has just lost the ability to hold.
  tally=0
  case "$(printf '%s' "$out" | tail -n 1)" in
    *'assertion(s) passed'*) tally=1 ;;
  esac
  if [ "$rc" -eq 0 ] && [ "$tally" -eq 0 ]; then
    failed=$((failed + 1))
    failed_list="$failed_list $f"
    printf 'FAIL  %-46s (exit 0, no tally: the harness trap was lost, %ss)\n' "$f" "$dt"
    printf '%s\n' "$out" | sed 's/^/      | /'
    echo "      | [tests] the file exited 0 without tests/lib.sh's closing line, so its"
    echo "      | [tests] failure count and sandbox cleanup never ran. Something replaced"
    echo "      | [tests] its EXIT trap; source no script that installs one of its own."
  elif [ "$rc" -eq 0 ]; then
    printf 'PASS  %-46s %s (%ss)\n' "$f" "$(printf '%s' "$out" | tail -n 1 | sed 's/^ *— *//')" "$dt"
    [ "$VERBOSE" -eq 1 ] && printf '%s\n' "$out"
  else
    failed=$((failed + 1))
    failed_list="$failed_list $f"
    printf 'FAIL  %-46s (exit %s, %ss)\n' "$f" "$rc" "$dt"
    printf '%s\n' "$out" | sed 's/^/      | /'
  fi
done
wait

echo "--------------------------------------------------------------"
# Which files to look at first when the suite gets slow. Wall clock is the sum
# of the slowest lane now, not of everything, so the three at the top are what
# actually decides how long a run takes.
if [ "$total" -gt 3 ]; then
  echo "[tests] slowest: $(printf '%s' "$slowest" | sort -rn | head -n 3 |
    while read -r d n; do printf '%s (%ss) ' "$n" "$d"; done)"
fi
if [ "$failed" -ne 0 ]; then
  echo "[tests] $failed of $total file(s) FAILED in $((SECONDS - started))s:" >&2
  for f in $failed_list; do echo "  $f" >&2; done
  # Carry the interpreter into the reproducer. A failure that only happens under
  # the floor is exactly the failure this variable exists to find, and a hint
  # that drops it sends the reader to a run that passes.
  echo "[tests] re-run one with: ${KB_TEST_BASH:+KB_TEST_BASH=$KB_TEST_BASH }bash tests/run.sh <substring of its path>" >&2
  exit 1
fi
echo "[tests] $total file(s) passed in $((SECONDS - started))s"
