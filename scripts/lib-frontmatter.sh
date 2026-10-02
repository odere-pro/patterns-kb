#!/usr/bin/env bash
# The one YAML-frontmatter reader in this repo. Source it; never run it.
#
#   . scripts/lib-frontmatter.sh
#
# Anything that is not bash reads frontmatter through scripts/fm-json.sh, which
# sources this file; TypeScript reaches that through tools/src/lib/frontmatter.ts.
# There is no second parser, in any language (spec: kb.content.frontmatter,
# "the only frontmatter parser"). If you are about to write `line.split(':')`
# anywhere, call fm-json.sh instead.
#
# Deliberately no `set -e`: the sourcing script owns its error policy.
#
# What a frontmatter block is, here:
#   - line 1 is `---`; the next `---` line closes it, and a later one never
#     reopens it. A file whose line 1 is anything else has no block.
#   - a field is a line `key: value` with `key` matching [A-Za-z_][A-Za-z0-9_-]*.
#     Indented lines (a block list's `- item`) and `# comments` are not fields,
#     so `tags:` followed by indented items reads as the empty string.
#   - the first of two same-named fields wins.
#   - CRLF line endings read the same as LF.
#
# What a value is, in the three modes:
#   raw      the text after `key:` and its spaces, verbatim.
#   default  one layer of MATCHING quotes removed. Inside double quotes, `\"`
#            is `"` and `\\` is `\` (every other backslash stays as written);
#            inside single quotes, `''` is `'`. Anything that is not wholly one
#            quoted string is returned as written.
#   lists    as default, except an inline list `[a, "b, c", 'd']` becomes a
#            list: items split on commas OUTSIDE quotes, each item unquoted as
#            above, a bare item trimmed and dropped when empty. So a quoted
#            item may hold commas and colons. A value that opens with `[` but
#            does not split cleanly (an unterminated quote, text after a
#            closing quote) stays a string — "not a list" is an answer.
# shellcheck shell=bash

# The awk program behind every mode. It reads file paths from stdin, one per
# line, and prints tab-separated records the caller assembles:
#   P <path>          a file starts (printed for every path, block or not)
#   S <key> <value>   a string field
#   B <key>           a list field starts (then zero or more L records)
#   L <key> <item>    one list item
# With `-v value_only=1` it prints only the first wanted field's value, raw
# text, no record prefix — the `kb_fm_field` answer.
# Variables: mode (raw|default|lists), want (space-joined field names, empty
# for all), value_only (0|1).
# shellcheck disable=SC2016
KB_FM_AWK='
function scan_quoted(s, i,    q, j, c, d, out, n) {
  q = substr(s, i, 1); n = length(s); out = ""; j = i + 1
  while (j <= n) {
    c = substr(s, j, 1)
    if (q == "\"" && c == "\\") {
      d = substr(s, j + 1, 1)
      if (d == "\"" || d == "\\") { out = out d; j += 2; continue }
      out = out c; j++; continue
    }
    if (c == q) {
      if (q == "\047" && substr(s, j + 1, 1) == "\047") { out = out "\047"; j += 2; continue }
      SCAN_OUT = out; return j
    }
    out = out c; j++
  }
  return 0
}
function rtrim(s) { sub(/[ \t]+$/, "", s); return s }
function unquote(v,    t, c, e) {
  t = rtrim(v); c = substr(t, 1, 1)
  if (c == "\"" || c == "\047") {
    e = scan_quoted(t, 1)
    if (e > 0 && e == length(t)) return SCAN_OUT
  }
  return v
}
function split_list(key, s,    n, i, c, e, cnt, start, item, k) {
  n = length(s); i = 1; cnt = 0
  while (1) {
    while (i <= n && (substr(s, i, 1) == " " || substr(s, i, 1) == "\t")) i++
    if (i > n) break
    c = substr(s, i, 1)
    if (c == "\"" || c == "\047") {
      e = scan_quoted(s, i)
      if (e == 0) return 0
      item = SCAN_OUT; i = e + 1
      while (i <= n && (substr(s, i, 1) == " " || substr(s, i, 1) == "\t")) i++
      if (i <= n && substr(s, i, 1) != ",") return 0
      ITEMS[++cnt] = item
      i++
      continue
    }
    start = i
    while (i <= n && substr(s, i, 1) != ",") i++
    item = rtrim(substr(s, start, i - start))
    if (item != "") ITEMS[++cnt] = item
    i++
  }
  print "B\t" key
  for (k = 1; k <= cnt; k++) print "L\t" key "\t" ITEMS[k]
  return 1
}
function emit(key, val,    t) {
  if (value_only) { print (mode == "raw" ? val : unquote(val)); return }
  if (mode == "raw") { print "S\t" key "\t" val; return }
  t = rtrim(val)
  if (mode == "lists" && t ~ /^\[.*\]$/) {
    if (split_list(key, substr(t, 2, length(t) - 2))) return
  }
  print "S\t" key "\t" unquote(val)
}
{
  path = $0
  if (!value_only) print "P\t" path
  n = 0; split("", seen)
  while ((getline line < path) > 0) {
    n++
    sub(/\r$/, "", line)
    if (n == 1) { if (line !~ /^---[[:space:]]*$/) break; continue }
    if (line ~ /^---[[:space:]]*$/) break
    if (match(line, /^[A-Za-z_][A-Za-z0-9_-]*:/)) {
      key = substr(line, 1, RLENGTH - 1)
      if (key in seen) continue
      seen[key] = 1
      if (want != "" && index(" " want " ", " " key " ") == 0) continue
      val = substr(line, RLENGTH + 1)
      sub(/^[ \t]+/, "", val)
      emit(key, val)
      if (value_only) break
    }
  }
  close(path)
}
'

# First single-line `<field>:` value of a file's frontmatter, one layer of
# matching quotes removed. Prints nothing when the field is absent.
kb_fm_field() { # <file> <field>
  printf '%s\n' "$1" | awk -v mode=default -v want="$2" -v value_only=1 "$KB_FM_AWK"
}

# First single-line `description:` value.
kb_fm_desc() { # <file>
  kb_fm_field "$1" description
}

# One JSON document for the named files, assembled by jq from the awk records.
#   <mode>    raw | default | lists
#   <single>  a path: print that file's object alone; empty: print
#             {"<path>": {…}, …} over every file, in argument order
#   <want>    space-joined field names; empty for every field
# Every value reaches jq as data (`-R` input), never as program text.
kb_fm_json() { # <mode> <single> <want> <file>...
  local mode="$1" single="$2" want="$3"
  shift 3
  printf '%s\n' "$@" |
    awk -v mode="$mode" -v want="$want" -v value_only=0 "$KB_FM_AWK" |
    jq -R -n --arg single "$single" '
      reduce (inputs | split("\t")) as $r ({o: {}, p: null};
        ($r[0]) as $t
        | if $t == "P" then (.p = ($r[1:] | join("\t"))) | setpath(["o", .p]; {})
          elif $t == "S" then setpath(["o", .p, $r[1]]; $r[2:] | join("\t"))
          elif $t == "B" then setpath(["o", .p, $r[1]]; [])
          elif $t == "L" then setpath(["o", .p, $r[1]]; getpath(["o", .p, $r[1]]) + [$r[2:] | join("\t")])
          else . end)
      | .o
      | if $single == "" then . else (.[$single] // {}) end'
}
