#!/bin/bash
# PostToolUse: checks only the file Claude just edited, so mistakes surface right
# away instead of in CI. Exit 2 hands the errors back to Claude to fix.
set -uo pipefail

file=$(node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{process.stdout.write(JSON.parse(s).tool_input?.file_path||"")}catch{}})')
[ -n "$file" ] && [ -f "$file" ] || exit 0

root="$CLAUDE_PROJECT_DIR"
rel="${file#"$root"/}"

case "$rel" in
  web/src/*.js|web/src/*.jsx)
    out=$(cd "$root/web" && npx --no-install oxlint "${rel#web/}" 2>&1) || { echo "$out" >&2; exit 2; } ;;
  backend/*.js)
    out=$(node --check "$file" 2>&1) || { echo "$out" >&2; exit 2; } ;;
  phoenix/*.dart)
    command -v dart >/dev/null || exit 0
    out=$(cd "$root/phoenix" && dart analyze --no-fatal-warnings "${rel#phoenix/}" 2>&1) || { echo "$out" >&2; exit 2; } ;;
esac
exit 0
