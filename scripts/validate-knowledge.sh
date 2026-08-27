#!/usr/bin/env bash
# Validate knowledge JSON files parse. No Node/npm required.
set -euo pipefail
ROOT="$(cd "$(dirname "$0")/.." && pwd)"
fail=0
while IFS= read -r -d '' f; do
  if ! python3 -c 'import json,sys; json.load(open(sys.argv[1]))' "$f" 2>/dev/null; then
    echo "INVALID JSON: $f" >&2
    fail=1
  else
    echo "ok  $f"
  fi
done < <(find "$ROOT/knowledge" -type f -name '*.json' -print0 | sort -z)

if [[ ! -f "$ROOT/SKILL.md" ]]; then
  echo "MISSING SKILL.md" >&2
  fail=1
fi

# Fail if Pi-extension leftovers reappear
for leftover in index.ts package.json src/tsconfig.json; do
  if [[ -e "$ROOT/$leftover" ]]; then
    echo "Pi-extension leftover present: $leftover" >&2
    fail=1
  fi
done

exit "$fail"
