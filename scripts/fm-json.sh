#!/usr/bin/env bash
# The one door into YAML frontmatter for anything that is not bash.
#
# TypeScript does not reparse frontmatter: it runs this script and reads the
# JSON (tools/src/lib/frontmatter.ts is the door on that side). The parsing
# lives in scripts/lib-frontmatter.sh, sourced below; this file only validates
# argv and hands the answer to jq. If you are tempted to write
# `line.split(':')` in tools/, call this instead.
#
# Usage: fm-json.sh [--raw | --lists] <file> [field ...]
#        fm-json.sh [--raw | --lists] --many <file> [<file> ...]
#        fm-json.sh --help
#
#   One file: prints one JSON object of the file's frontmatter fields, in file
#   order. With no field names every single-line `key: value` is emitted; with
#   field names only those, and only the ones present — so `has(key)` is the
#   presence answer and the value may be the empty string.
#
#   --many: prints ONE JSON object keyed by each path exactly as given, in
#   argument order: {"<path>": {…}, …}. A file with no block maps to {}. One
#   process for a whole batch, which is the reason it exists: a gate reading
#   382 pages would otherwise spawn 382 parsers.
#
#   --raw   every value exactly as written, quotes and all.
#   --lists an inline list `[a, "b, c"]` becomes a JSON array; any other value
#           stays a string. Without it a list is the string `[a, "b, c"]`.
#   Default: one layer of matching quotes stripped (see lib-frontmatter.sh for
#   the escapes it honours).
#
#   Exit: 0 on readable paths (a file with no frontmatter prints {}),
#         2 on misuse — unknown flag, no path, an unreadable path, a path
#         holding a newline, a bad field name, --raw with --lists, or field
#         names with --many. Nothing is printed on stdout on exit 2.
set -euo pipefail

_usage() { echo "usage: fm-json.sh [--raw | --lists] <file> [field ...] | [--raw | --lists] --many <file>..."; }

SCRIPT_DIR="$(cd "$(dirname "$0")" && pwd -P)"

# ---------------------------------------------------------------------------
# argv, validated before anything is read
# ---------------------------------------------------------------------------
raw=0
lists=0
many=0
files=()
fields=()
while [ $# -gt 0 ]; do
  case "$1" in
    --raw) raw=1 ;;
    --lists) lists=1 ;;
    --many) many=1 ;;
    -h|--help) _usage; exit 0 ;;
    -*) _usage >&2; exit 2 ;;
    *)
      if [ "$many" -eq 1 ] || [ "${#files[@]}" -eq 0 ]; then
        files+=("$1")
      else
        # A field name reaches awk as data, but it is still checked: a plain
        # YAML key, and nothing that could be read as a second path.
        case "$1" in
          *[!A-Za-z0-9_-]*|"") echo "[fm-json] not a field name: $1" >&2; exit 2 ;;
        esac
        fields+=("$1")
      fi
      ;;
  esac
  shift
done

[ "${#files[@]}" -gt 0 ] || { _usage >&2; exit 2; }
if [ "$raw" -eq 1 ] && [ "$lists" -eq 1 ]; then
  echo "[fm-json] --raw and --lists are two answers to one question; pick one" >&2
  exit 2
fi
command -v jq >/dev/null 2>&1 || { echo "[fm-json] jq required" >&2; exit 2; }
nl='
'
for f in "${files[@]}"; do
  case "$f" in *"$nl"*) echo "[fm-json] a path holding a newline cannot be read: $f" >&2; exit 2 ;; esac
  [ -f "$f" ] && [ -r "$f" ] || { echo "[fm-json] no such readable file: $f" >&2; exit 2; }
done

# shellcheck source=scripts/lib-frontmatter.sh disable=SC1091
. "$SCRIPT_DIR/lib-frontmatter.sh"

mode=default
[ "$raw" -eq 1 ] && mode=raw
[ "$lists" -eq 1 ] && mode=lists

if [ "$many" -eq 1 ]; then
  kb_fm_json "$mode" "" "" "${files[@]}"
else
  # bash 3.2 expands "${fields[*]}" of an empty array as unbound under
  # `set -u`; the `+` form says "nothing, then".
  kb_fm_json "$mode" "${files[0]}" "${fields[*]+${fields[*]}}" "${files[0]}"
fi
