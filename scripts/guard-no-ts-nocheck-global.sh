#!/usr/bin/env bash
# D20-Gate-2 — Global denylist guard for @ts-nocheck / @ts-ignore.
#
# Institutional replacement for the legacy allowlist guard (Tier 1). After the
# D2–D19 program closure, ANY active `@ts-nocheck` or `@ts-ignore` in production
# code is a regression, not a debt item — so enforcement no longer depends on a
# maintained list of protected files.
#
# Scope
#   - Scans:  src/ and supabase/functions/
#   - Ignores: dist/, build/, node_modules/, dev-dist/, .git/, generated code,
#              test fixtures, and __tests__ dirs (which may need @ts-expect-error
#              for legitimate mock boundaries — covered by ESLint policy).
#
# @ts-expect-error is NOT flagged here — it is governed by ESLint
# (ban-ts-comment with descriptionFormat) and requires a justification comment.
#
# Reference: docs/policies/16_type_safety_policy.md

set -uo pipefail

PATTERN='^[[:space:]]*(//|/\*)[[:space:]]*@ts-(nocheck|ignore)\b'

# Directories that MUST be clean.
SCAN_ROOTS=(
  "src"
  "supabase/functions"
)

# Path fragments to ignore. Kept small and explicit — additions require an ADR.
IGNORE_GLOBS=(
  '!**/node_modules/**'
  '!**/dist/**'
  '!**/build/**'
  '!**/dev-dist/**'
  '!**/.next/**'
  '!**/.turbo/**'
  '!**/coverage/**'
  '!**/__tests__/**'
  '!**/__mocks__/**'
  '!**/__fixtures__/**'
  '!**/fixtures/**'
  '!**/*.test.ts'
  '!**/*.test.tsx'
  '!**/*.spec.ts'
  '!**/*.spec.tsx'
  '!**/database.types.ts'
  '!**/integrations/supabase/types.ts'
)

if ! command -v rg >/dev/null 2>&1; then
  echo "ERROR: ripgrep (rg) is required for D20-Gate-2 guard." >&2
  exit 2
fi

RG_ARGS=(-n --no-heading --color never -e "$PATTERN")
for g in "${IGNORE_GLOBS[@]}"; do
  RG_ARGS+=(-g "$g")
done

HITS=$(rg "${RG_ARGS[@]}" "${SCAN_ROOTS[@]}" 2>/dev/null || true)

if [[ -n "$HITS" ]]; then
  echo "❌ D20-Gate-2 violation: active @ts-nocheck or @ts-ignore found in production code."
  echo
  echo "$HITS"
  echo
  echo "Policy: docs/policies/16_type_safety_policy.md"
  echo "  - @ts-nocheck and @ts-ignore are PROHIBITED outside of tests/fixtures."
  echo "  - Fix the underlying type error, or use @ts-expect-error with a justification"
  echo "    in a test boundary (governed by ESLint ban-ts-comment)."
  exit 1
fi

echo "✅ D20-Gate-2 PASS: no active @ts-nocheck/@ts-ignore in src/ or supabase/functions/."
exit 0
