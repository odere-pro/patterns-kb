#!/usr/bin/env bash
# PreToolUse(Bash): deny the commands that run, exit 0 and leave the wrong
# answer behind (spec: kb.harness.hooks, guard).
#
# This tree is shared: other sessions edit it, stage into the same git index
# and share what `make gen` writes (docs/concepts/working-in-this-repo.md).
# A handful of ordinary commands are therefore traps here. Each one succeeds,
# prints nothing alarming, and leaves another session's work swept into a
# commit, a file swapped for a stale copy, or a run held to no floor — and
# nothing lands in the tree for a gate to catch. Stopping the command before
# it runs is the only place left to catch it.
#
# The command line is first read the way the shell reads it, by the awk
# program in NORMALIZE, into its simple commands, one per line:
#
#   - a separator (; & | ( ) or a newline) ends one, and a `$( )` or backtick
#     substitution is one of its own, inside double quotes too;
#   - quoted text and an escaped character stay in their word but go inert:
#     letters and digits are kept, anything else becomes `_`, so a message or
#     a pattern can never read as a flag, a path or a separator;
#   - a heredoc body, a comment, and a redirection with its target are dropped;
#   - leading assignments, the reserved words { } ! then do else elif if while
#     until, and the prefixes env sudo nohup nice exec command builtin xargs
#     time with their options are stripped, so the program comes first.
#
# Each row is then a tab-separated id, a grep -E pattern anchored at the start
# of one simple command, and what to run instead. The same characters as an
# argument — grepped, echoed, in a commit message or a heredoc — are never at
# that start, so they are never denied: a guard that blocks a correct command
# is worse than the trap. `allowed` holds the exemptions that depend on more
# than the text, and judges only the simple command that matched.
#
# Reads the payload on stdin, prints one deny object on a match or nothing,
# never writes a file, never reaches the network, and always exits 0: a guard
# that crashes must not be able to block a session. What it cannot read — a
# script handed to `bash -c`, a quoted path — it lets through.
#
# Adding a row: one line below, a case in `allowed` if it needs one, and a
# deny case plus a corrected-form case in tests/hooks/guard-commands.test.sh.
set -uo pipefail

payload="$(cat 2>/dev/null || true)"
command -v jq >/dev/null 2>&1 || exit 0

cmd="$(printf '%s' "$payload" |
  jq -r 'if type == "object" then (.tool_input.command // "") else "" end' 2>/dev/null || true)"
[ -n "$cmd" ] || exit 0

root="${CLAUDE_PROJECT_DIR:-$(git rev-parse --show-toplevel 2>/dev/null || true)}"

# The shell's reading of one command line, as described above: POSIX awk, one
# line at a time, the lexer's state carried from line to line.
NORMALIZE='
function push(kind, ret) {
  d++; fk[d] = kind; fr[d] = ret; fc[d] = cur; fp[d] = 0; fd[d] = drop; fdd[d] = dropped
  cur = ""; st = "N"; drop = 0; dropped = 0
}
function pop() {
  endcmd(); cur = fc[d]; st = fr[d]; drop = fd[d]; dropped = fdd[d]; d--
  lit("_")
}
function lit(c) {
  if (hdc) { hdw = hdw c; return }
  if (drop) { dropped = 1; return }
  cur = cur c
}
function inert(c) {
  if (hdc) { hdw = hdw c; return }
  lit(c ~ /[A-Za-z0-9]/ ? c : "_")
}
function heredoc() { hpn++; hpd[hpn] = hdw; hps[hpn] = hdstrip; hdc = 0; hdw = "" }
function brk() {
  if (hdc) { if (hdw != "") heredoc(); return }
  if (drop) { if (dropped) { drop = 0; dropped = 0 }; return }
  if (cur != "" && substr(cur, length(cur), 1) != " ") cur = cur " "
}
function endcmd() {
  if (hdc && hdw != "") heredoc()
  hdc = 0; drop = 0; dropped = 0
  emit(cur); cur = ""
}
function fd_word(   k) {
  # A redirection names its file descriptor in the word before it: 2>, 1>&2.
  k = length(cur)
  while (k > 0 && substr(cur, k, 1) ~ /[0-9]/) k--
  if (k < length(cur) && (k == 0 || substr(cur, k, 1) == " ")) cur = substr(cur, 1, k)
}
function emit(s,   w, nw, k, out, p) {
  nw = split(s, w, " ")
  k = 1
  while (k <= nw) {
    if (w[k] ~ /^[A-Za-z_][A-Za-z0-9_]*=/ || w[k] in RESERVED) { k++; continue }
    if (w[k] in PREFIX) {
      p = w[k]; k++
      while (k <= nw && w[k] ~ /^-/) {
        if (index(" " VALUED[p] " ", " " w[k] " ")) k++
        k++
      }
      continue
    }
    break
  }
  out = ""
  for (; k <= nw; k++) out = out (out == "" ? "" : " ") w[k]
  if (out != "") print out
}
function lex(s,   n, i, c) {
  n = split(s, ch, "")
  for (i = 1; i <= n; i++) {
    c = ch[i]
    if (st == "S") { if (c == sq) st = "N"; else inert(c); continue }
    if (st == "A") {
      if (c == "\\") { i++; inert(ch[i]) } else if (c == sq) st = "N"; else inert(c)
      continue
    }
    if (st == "D") {
      if (c == "\"") st = "N"
      else if (c == "\\") { i++; inert(ch[i]) }
      else if (c == "$" && ch[i + 1] == "(") { i++; push("sub", "D") }
      else if (c == "`") push("bq", "D")
      else inert(c)
      continue
    }
    if (c == "\\") { i++; if (ch[i] != "\n") inert(ch[i]); continue }
    if (c == sq) { st = "S"; continue }
    if (c == "\"") { st = "D"; continue }
    if (c == "$" && ch[i + 1] == sq) { i++; st = "A"; continue }
    if (c == "$" && ch[i + 1] == "(") { i++; push("sub", "N"); continue }
    if (c == "`") { if (fk[d] == "bq") pop(); else push("bq", "N"); continue }
    if (c == "(") { fp[d]++; endcmd(); continue }
    if (c == ")") {
      if (fp[d] > 0) { fp[d]--; endcmd() } else if (fk[d] == "sub") pop(); else endcmd()
      continue
    }
    if (c == "&" && ch[i + 1] == ">") { i++; c = ">" }
    if (c == "<" || c == ">") {
      if (ch[i + 1] == "(") continue
      fd_word()
      if (c == "<" && ch[i + 1] == "<" && ch[i + 2] == "<") { i += 2; drop = 1; dropped = 0; continue }
      if (c == "<" && ch[i + 1] == "<") {
        i++; hdstrip = 0
        if (ch[i + 1] == "-") { i++; hdstrip = 1 }
        hdc = 1; hdw = ""
        continue
      }
      while (ch[i + 1] == ">" || ch[i + 1] == "<" || ch[i + 1] == "&" || ch[i + 1] == "|") i++
      drop = 1; dropped = 0
      continue
    }
    if (c == ";" || c == "&" || c == "|") { endcmd(); continue }
    if (c == "\n") { endcmd(); if (hpn > 0) hcur = 1; continue }
    if (c == " " || c == "\t") { brk(); continue }
    if (c == "#" && !hdc && !drop && (cur == "" || substr(cur, length(cur), 1) == " ")) {
      while (i < n && ch[i + 1] != "\n") i++
      continue
    }
    lit(c)
  }
}
BEGIN {
  sq = sprintf("%c", 39)
  split("{ } ! then do else elif if while until", r, " ")
  for (k in r) RESERVED[r[k]] = 1
  split("env sudo nohup nice exec command builtin xargs time", r, " ")
  for (k in r) PREFIX[r[k]] = 1
  VALUED["env"] = "-u -C -S"
  VALUED["sudo"] = "-u -g -h -p -C -D -r -t -U -T"
  VALUED["nice"] = "-n"
  VALUED["exec"] = "-a"
  VALUED["xargs"] = "-I -n -P -L -s -d -E -a"
  VALUED["time"] = "-f -o"
  d = 0; fk[0] = "top"; fp[0] = 0; st = "N"; cur = ""; hpn = 0; hcur = 0
}
hcur > 0 {
  # A heredoc body, skipped whole, up to the line holding its delimiter.
  line = $0
  if (hps[hcur]) sub(/^\t+/, "", line)
  if (line == hpd[hcur]) { hcur++; if (hcur > hpn) { hpn = 0; hcur = 0 } }
  next
}
{ lex($0 "\n") }
END {
  while (d > 0) pop()
  endcmd()
}
'

# `git`, by any path, with any global options before its subcommand.
G='^([^[:space:]]*/)?git([[:space:]]+(-[Cc][[:space:]]+[^[:space:]]+|--(git-dir|work-tree|namespace|exec-path|super-prefix|config-env)[[:space:]]+[^[:space:]]+|-[-A-Za-z][^[:space:]]*))*[[:space:]]+'
# Any words, then the one a row looks for, then the end of that word.
W='([[:space:]]+[^[:space:]]+)*[[:space:]]+'
E='([[:space:]]|$)'

rows() {
  cat <<ROWS
stage-all	${G}add${W}(-[A-Za-z]*[Au][A-Za-z]*|--all|--update|\.|:/|[^[:space:]]*/)${E}	Stage exact paths: another session's half-finished work shares this tree, and -A, -u, . or a directory stages it with yours. Run: git add <file> <file>, then git diff --cached --stat to see exactly what you staged.
commit-all	${G}commit${W}(-[A-Za-z]*a[A-Za-z]*|--all)${E}	git commit -a stages every tracked change in the tree, other sessions' included. Stage exact paths first (git add <file>), then run git commit without -a.
commit-path	${G}commit${W}(\.|:/|[^[:space:]-][^[:space:]]*/)${E}	git commit with a directory, . or :/ commits every change under it, other sessions' included. Stage exact paths first (git add <file>), then run git commit with no path.
index-restore	${G}(checkout${W}(--|\.)${E}|restore${E})	This restores from the git index, which other sessions stage into and which lags HEAD, so it can swap your file for an older copy. Run instead: git show HEAD:<path> > <path>
amend	${G}commit${W}--amend${E}	git commit --amend commits the shared index, and another session's staged work with it. Reword your own last commit from its tree instead: git commit-tree "\$(git rev-parse 'HEAD^{tree}')" -p HEAD^ -F <msgfile>, then git update-ref refs/heads/<branch> <new> <old>.
force-push-main	${G}push${W}(-f|--force|--force-with-lease(=[^[:space:]]*)?|--force-if-includes|-[A-Za-z]*f[A-Za-z]*|\+[^[:space:]]+)${E}	A force push to main rewrites it for every clone. Push your own branch and open a pull request instead: git push <remote> <branch>.
vitest-coverage	^((npx|pnpm|yarn|bunx)([[:space:]]+-[^[:space:]]*)*[[:space:]]+|npm([[:space:]]+-[^[:space:]]*)*[[:space:]]+exec([[:space:]]+-[^[:space:]]*)*[[:space:]]+|[^[:space:]]*/)?vitest${W}--coverage([.=][^[:space:]]*)?${E}	The coverage floors live in tools/vitest.config.ts, and vitest reads the config where it starts; from the repo root it finds none and holds the run to no floor. Run: make tools-test (one file, without coverage: make tools-test T=<name>).
make-all	^([^[:space:]]*/)?g?make${W}all${E}	make all built the HTML pages and retired with them. The generated blocks and reference pages are rebuilt by: make gen (then make validate).
retired-builder	^node([[:space:]]+-[^[:space:]]+)*[[:space:]]+(\./)?scripts/(build|check-|audit-|report-|lint-claude|with-lock)[^[:space:]]*\.mjs${E}	The HTML-era programs under scripts/ retired with the HTML pages; only scripts/kb.mjs remains. Rebuild with make gen, check with make validate (one gate: make gate G=<name>, from docs/reference/gates.md).
ROWS
}

# Is main the branch checked out in the project?
on_main() {
  [ -n "$root" ] && [ "$(git -C "$root" rev-parse --abbrev-ref HEAD 2>/dev/null)" = main ]
}

# Does this push rewrite main: a refspec naming it, a refspec naming the
# checked-out branch (HEAD, @) while that is main, or no refspec while main is
# checked out? Word-split with globbing off, so a `*` refspec stays text.
push_targets_main() { # <simple command>
  local w n=0 after=0
  set -f
  for w in $1; do
    if [ "$after" -eq 0 ]; then
      [ "$w" = push ] && after=1
      continue
    fi
    case "$w" in -*) continue ;; esac
    n=$((n + 1))
    # The first word after the options is the remote.
    [ "$n" -eq 1 ] && continue
    case "$w" in
      main | +main | refs/heads/main | +refs/heads/main | *:main | *:refs/heads/main)
        set +f
        return 0
        ;;
      HEAD | +HEAD | @ | +@)
        if on_main; then
          set +f
          return 0
        fi
        ;;
    esac
  done
  set +f
  [ "$n" -le 1 ] && on_main && return 0
  return 1
}

# Where the last `cd` before simple command <n> moved to.
cd_before() { # <n>
  [ "$1" -gt 1 ] || return 0
  printf '%s\n' "$norm" | head -n $(($1 - 1)) | grep -E '^(cd|pushd)[[:space:]]' | tail -n 1 |
    sed -E 's/^(cd|pushd)[[:space:]]+//'
}

allowed() { # <id> <simple command> <its number> — 0 when it already does the right thing
  case "$1" in
    index-restore)
      # A restore from an explicit source, or of the index entry itself, does
      # not copy the stale index over your working file.
      case " $2 " in
        *" restore "*--source* | *" restore "*" -s "* | *" restore "*--staged* | *" restore "*" -S "*) return 0 ;;
      esac
      return 1
      ;;
    amend)
      # With nothing staged, the index is HEAD's tree and the amend commits
      # only what is already committed.
      [ -n "$root" ] && git -C "$root" diff --cached --quiet 2>/dev/null && return 0
      return 1
      ;;
    force-push-main)
      push_targets_main "$2" && return 1
      return 0
      ;;
    vitest-coverage)
      # Started in tools/, or pointed at it, vitest finds the floors.
      case " $2 " in
        *" --prefix tools "* | *" -w tools "* | *" --workspace tools "* | *" --workspace=tools "* | \
          *" --root tools "* | *" --dir tools "* | *" --config tools/"* | *" -c tools/"*) return 0 ;;
      esac
      case "$(cd_before "$3")" in
        tools | tools/ | */tools | */tools/) return 0 ;;
      esac
      return 1
      ;;
    *) return 1 ;;
  esac
}

deny() { # <reason>
  jq -nc --arg r "$1" \
    '{hookSpecificOutput:{hookEventName:"PreToolUse",permissionDecision:"deny",permissionDecisionReason:$r}}' 2>/dev/null
  exit 0
}

norm="$(printf '%s\n' "$cmd" | awk "$NORMALIZE" 2>/dev/null || true)"
[ -n "$norm" ] || exit 0

while IFS="$(printf '\t')" read -r id pattern reason; do
  [ -n "${id:-}" ] || continue
  hits="$(printf '%s\n' "$norm" | grep -En -- "$pattern" 2>/dev/null || true)"
  [ -n "$hits" ] || continue
  while IFS= read -r hit; do
    [ -n "$hit" ] || continue
    allowed "$id" "${hit#*:}" "${hit%%:*}" && continue
    deny "$reason"
  done <<HITS
$hits
HITS
done <<EOF
$(rows)
EOF

exit 0
