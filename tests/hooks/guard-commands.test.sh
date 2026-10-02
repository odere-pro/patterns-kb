#!/usr/bin/env bash
# .claude/hooks/guard-commands.sh — the PreToolUse guard that denies the
# commands which run, exit 0 and leave the wrong answer behind.
#
# "Does it deny" is one question of four. The others: that the corrected form
# goes through (a guard with a false positive is worse than the trap), that the
# trapped command named only as an argument is left alone, and that garbage on
# stdin leaves it silent with exit 0 — it sits in front of every shell call, so
# a crash here would block a session rather than a command.
set -uo pipefail
# shellcheck source=tests/lib.sh disable=SC1091
. "$(dirname "$0")/../lib.sh"

HOOK="$KB_REPO_ROOT/.claude/hooks/guard-commands.sh"

guard() { # <command>
  run_hook "$HOOK" "$(bash_payload "$1")"
}

assert_denied() { # <command> <needle> <label>
  guard "$1"
  assert_hook_denied "$3" "$2"
}

assert_allowed() { # <command> <label>
  guard "$1"
  assert_hook_silent "$2"
}

# A row's trap in every command position a shell has: the line start, after
# an operator, inside a substitution, a subshell or a group, after a reserved
# word, and behind an assignment or a command prefix.
assert_denied_everywhere() { # <trap> <needle> <label>
  assert_denied "$1" "$2" "$3 at the line start"
  assert_denied "  $1" "$2" "$3 after leading spaces"
  assert_denied "git status && $1" "$2" "$3 after &&"
  assert_denied "true; $1" "$2" "$3 after ;"
  assert_denied "echo x | $1" "$2" "$3 after a pipe"
  assert_denied "ls
$1" "$2" "$3 on a second line"
  assert_denied "out=\$($1)" "$2" "$3 inside \$( )"
  assert_denied "echo \"\$($1)\"" "$2" "$3 inside a quoted \$( )"
  assert_denied "echo \`$1\`" "$2" "$3 closing a backtick substitution"
  assert_denied "(cd /tmp && $1)" "$2" "$3 inside a subshell"
  assert_denied "{ $1; }" "$2" "$3 inside a group"
  assert_denied "if true; then $1; fi" "$2" "$3 after then"
  assert_denied "for f in a; do $1; done" "$2" "$3 after do"
  assert_denied "! $1" "$2" "$3 after !"
  assert_denied "GIT_TRACE=0 $1" "$2" "$3 behind an assignment"
  for prefix in "env" "sudo" "time" "command" "nohup" "nice -n 5" "xargs -0"; do
    assert_denied "$prefix $1" "$2" "$3 behind $prefix"
  done
  assert_denied "$1 2>/dev/null" "$2" "$3 with a redirection"
}

# The trap's words where the shell reads them as text: in a commit message
# beside an operator, in a heredoc body, echoed, in a comment.
assert_text_only() { # <trap> <label>
  assert_allowed "git commit -m \"fix; $1 was wrong\"" "$2 in a message after a quoted ;"
  assert_allowed "git commit -m \"($1)\"" "$2 in a message inside quoted parentheses"
  assert_allowed "git commit -m '$1 && more'" "$2 in a single-quoted message"
  assert_allowed "git commit -m \"\$(cat <<'EOF'
subject

$1 is what the body describes
EOF
)\"" "$2 in the body of a heredoc commit message"
  assert_allowed "cat > /tmp/msg <<'EOF'
$1 restores from the index
EOF" "$2 in a heredoc written to a file"
  assert_allowed "echo $1" "$2 echoed"
  assert_allowed "ls # $1" "$2 in a comment"
}

echo "== the hook is installable at all =="
assert_file "$HOOK" "the hook exists"
assert_executable "$HOOK" "the hook is executable"

make_sandbox
printf 'x\n' > "$PROJECT/a.txt"
git add a.txt && git commit -q -m base

echo "== harness-O3 =="
assert_denied "git add -A" "git add <file> <file>" "harness-O3: a command matching a row draws one deny naming what to run instead"
assert_equal "1" "$(printf '%s\n' "$OUTPUT" | grep -c '^{')" "harness-O3: one deny object"
assert_allowed "make validate" "harness-O3: a command matching no row draws nothing"

echo "== stage-all =="
for trap in "git add -A" "git add --all" "git add -u" "git add ." "git add docs/" "git -C /tmp add -A" "git add :/"; do
  assert_denied "$trap" "git add <file> <file>" "$trap"
done
assert_denied_everywhere "git add -A" "git add <file>" "git add -A"
assert_allowed "git add CLAUDE.md docs/inbox.md" "the corrected form: exact paths"
assert_allowed "git add ./site/hazards/deadlock.html" "an exact path written with ./"
assert_allowed "git add -- tools/src/a.ts" "exact paths after --"
assert_allowed "grep -n 'git add -A' CLAUDE.md" "grepping for the trap"
assert_allowed "echo git add ." "echoing the trap"
assert_allowed "sed -n 1p docs/concepts/working-in-this-repo.md # git add ." "the trap in a comment after another command"
for trap in "git add -Av" "git add -vA" "git add -uv" "git --no-pager add -A" "git -c core.x=1 add ." "/usr/bin/git add -A"; do
  assert_denied "$trap" "git add <file> <file>" "$trap"
done
assert_text_only "git add -A" "git add -A"
assert_allowed "git add -A-file" "a file whose name starts like the flag"
assert_allowed "git add ./-A" "a file named -A, written as a path"
assert_allowed "git add \"docs/\"" "a quoted argument is text, not a directory"

echo "== commit-all =="
assert_denied_everywhere "git commit -a -m x" "without -a" "git commit -a"
assert_denied "git commit -am x" "without -a" "a flag cluster holding a"
assert_denied "git commit -q --all -m x" "without -a" "--all after another flag"
assert_allowed "git commit -m x" "the corrected form"
assert_allowed "git commit -m 'use -a flag'" "-a inside the message"
assert_allowed "git commit --allow-empty -m x" "a long flag that starts with --all"
assert_denied "git commit -m \"fix the thing\" -a" "without -a" "-a after the message"
assert_denied "git commit -m \"fix the thing\" --all" "without -a" "--all after the message"
assert_denied "git commit -F /tmp/msg -a" "without -a" "-a after a message file"
assert_text_only "git commit -a" "git commit -a"

echo "== commit-path =="
assert_denied_everywhere "git commit -m x ." "with no path" "git commit ."
for trap in "git commit ." "git commit -m x docs/" "git commit -m x -- tools/src/" "git commit -m x :/" "git commit -i -m x docs/"; do
  assert_denied "$trap" "with no path" "$trap"
done
assert_allowed "git commit -m x" "the corrected form"
assert_allowed "git commit -m \"update docs/\"" "a message that ends in a slash"
assert_allowed "git commit -m \".\"" "a message that is a dot"
assert_text_only "git commit ." "git commit ."

echo "== index-restore =="
assert_denied_everywhere "git checkout -- a.txt" "git show HEAD:<path> > <path>" "git checkout -- <path>"
assert_denied "git checkout HEAD -- a.txt" "git show HEAD" "checkout from a tree into the index"
assert_denied "git checkout ." "git show HEAD" "git checkout ."
assert_denied "git restore a.txt" "git show HEAD" "git restore <path>"
assert_allowed "git show HEAD:a.txt > a.txt" "the corrected form"
assert_allowed "git restore --source=HEAD a.txt" "a restore from an explicit source"
assert_allowed "git restore --staged a.txt" "unstaging a path"
assert_allowed "git checkout main" "switching branches"
assert_allowed "git checkout -b feature" "creating a branch"
assert_denied "git restore --staged . && git restore ." "git show HEAD" "a second restore after an exempt one"
assert_text_only "git checkout -- a.txt" "git checkout --"

echo "== amend =="
assert_allowed "git commit --amend -m x" "an amend with nothing staged commits only HEAD's tree"
printf 'y\n' > "$PROJECT/a.txt"
git add a.txt
assert_denied_everywhere "git commit --amend -m x" "git commit-tree" "git commit --amend with work staged"
assert_allowed "git commit -m x" "a plain commit"
git reset -q a.txt
git show HEAD:a.txt > a.txt

echo "== force-push-main =="
assert_denied_everywhere "git push --force origin main" "git push <remote> <branch>" "a forced push naming main"
assert_denied "git push -f" "git push <remote> <branch>" "a forced push with no refspec while on main"
assert_denied "git push origin +main" "git push <remote> <branch>" "a + refspec on main"
assert_denied "git push --force-with-lease origin HEAD:main" "git push <remote> <branch>" "a lease onto main"
assert_allowed "git push origin main" "the corrected form: a plain push"
assert_allowed "git push -f origin feature" "forcing your own branch"
git checkout -q -b feature
assert_allowed "git push --force" "forcing with no refspec off main"
git checkout -q main
assert_allowed "git push --force-with-lease=main:abc origin feature" "a lease flag that mentions main"
for trap in "git push --force origin HEAD" "git push origin +HEAD" "git push --force origin @" "git push origin main --force" "git push -uf origin main"; do
  assert_denied "$trap" "git push <remote> <branch>" "$trap on main"
done
git checkout -q -b feature2
assert_allowed "git push --force origin HEAD" "forcing HEAD off main"
git checkout -q main
assert_text_only "git push --force origin main" "git push --force"

echo "== vitest-coverage =="
assert_denied_everywhere "npx vitest run --coverage" "make tools-test" "vitest coverage from the root"
assert_denied "vitest --coverage" "make tools-test" "bare vitest with coverage"
assert_allowed "make tools-test" "the corrected form"
assert_allowed "cd tools && npx vitest run --coverage" "coverage started in tools/"
assert_allowed "(cd tools && npx vitest run --coverage)" "coverage started in tools/, in a subshell"
assert_allowed "npm --prefix tools exec vitest -- run --coverage" "coverage pointed at tools/"
for trap in "node_modules/.bin/vitest run --coverage" "npx --yes vitest run --coverage" "npm exec vitest -- run --coverage" "cd tools && cd .. && npx vitest run --coverage"; do
  assert_denied "$trap" "make tools-test" "$trap"
done
assert_allowed "npx vitest run src/lib/glob.test.ts" "a run without coverage"
assert_allowed "grep -rn 'vitest --coverage' docs" "grepping for the trap"

echo "== make-all =="
assert_denied_everywhere "make all" "make gen" "the HTML-era build"
assert_denied "make -j4 all" "make gen" "make all behind a flag"
assert_allowed "make gen" "the corrected form"
assert_allowed "make gen && make validate" "the corrected form, checked"
assert_allowed "make gate G=check-json" "a target that is not all"
assert_allowed "grep -n 'make all' docs/inbox.md" "grepping for the trap"

echo "== retired-builder =="
assert_denied_everywhere "node scripts/build.mjs" "make gen" "the HTML-era graph builder"
for trap in "node scripts/build-pages.mjs --check" "node ./scripts/check-mermaid.mjs" "node scripts/report-lens.mjs" "node scripts/lint-claude.mjs" "node --no-warnings scripts/audit-vocab.mjs"; do
  assert_denied "$trap" "make validate" "$trap"
done
assert_allowed "node scripts/kb.mjs find 'one slow dependency'" "the kb.mjs launcher"
assert_allowed "make validate" "the corrected form"

echo "== everything else is none of its business =="
assert_allowed "git status --short" "an unrelated git command"
assert_allowed "node scripts/kb.mjs find 'git add -A'" "the trap as an argument to another program"

echo "== it cannot take a session down with it =="
for input in 'not json at all' '' '[1,2,3]' '{"tool_name":"Read","tool_input":{"file_path":"x"}}' '"a string"'; do
  run_hook "$HOOK" "$input"
  assert_hook_silent "input: ${input:-<empty>}"
done
payload="$(bash_payload "git add -A")"
path_without jq
run_hook "$HOOK" "$payload"
assert_hook_silent "no jq on PATH"
path_restore

echo "== it never touches the tree =="
before="$(tree_digest "$PROJECT")"
index_before="$(git ls-files -s)"
for c in "git add -A" "git commit -a -m x" "git checkout -- a.txt" "git push --force origin main"; do guard "$c"; done
assert_equal "$before" "$(tree_digest "$PROJECT")" "every project file keeps its bytes"
assert_equal "$index_before" "$(git ls-files -s)" "the index is untouched"

echo "== the wiring =="
settings="$KB_REPO_ROOT/.claude/settings.json"
assert_equal '"$CLAUDE_PROJECT_DIR"/.claude/hooks/guard-commands.sh' \
  "$(jq -r '.hooks.PreToolUse[] | select(.matcher == "Bash") | .hooks[].command' "$settings")" \
  "PreToolUse on the shell tool runs this guard"
assert_equal '"$CLAUDE_PROJECT_DIR"/.claude/hooks/after-write.sh' \
  "$(jq -r '.hooks.PostToolUse[] | select(.matcher == "Edit|Write|MultiEdit") | .hooks[].command' "$settings")" \
  "PostToolUse on the edit and write tools runs the advisory"
for cmd in $(jq -r '.hooks[][].hooks[].command' "$settings" | sed 's#"$CLAUDE_PROJECT_DIR"/##'); do
  assert_executable "$KB_REPO_ROOT/$cmd" "the wired $cmd exists and runs"
done
assert_contains "$(jq -c '.permissions.deny' "$settings")" '"Edit(/site/dist/**)"' "an edit under the built site is denied"
assert_contains "$(jq -c '.permissions.deny' "$settings")" '"Edit(/site/.astro/**)"' "an edit under the site cache is denied"
