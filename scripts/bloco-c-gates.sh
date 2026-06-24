#!/usr/bin/env bash
# Bloco C — anti-regression gates
# Blocks: .bak files, raw dangerouslySetInnerHTML, console.* outside wrappers.
# Stays away from auth/HMAC/heartbeat/jobs paths — read-only inspection.

set -uo pipefail

FAIL=0
RED='\033[0;31m'; GREEN='\033[0;32m'; YELLOW='\033[1;33m'; NC='\033[0m'

echo "==> C-GATE-1: forbid versioned *.bak / *.orig"
BAK=$(git ls-files '*.bak' '*.orig' 2>/dev/null || find . -name '*.bak' -o -name '*.orig' 2>/dev/null | grep -v node_modules || true)
if [ -n "$BAK" ]; then
  echo -e "${RED}FAIL${NC}: backup files tracked:"; echo "$BAK"; FAIL=1
else
  echo -e "${GREEN}PASS${NC}"
fi

echo "==> C-GATE-2: dangerouslySetInnerHTML allowlist"
ALLOWED_DANGER=(
  "src/components/ui/FormattedText.tsx"
  "src/components/landing/SEO.tsx"
)
VIOLATIONS=$(grep -rln "dangerouslySetInnerHTML={" --include="*.ts" --include="*.tsx" src supabase/functions 2>/dev/null || true)
if [ -n "$VIOLATIONS" ]; then
  while IFS= read -r f; do
    ok=0
    for a in "${ALLOWED_DANGER[@]}"; do [ "$f" = "$a" ] && ok=1; done
    if [ $ok -eq 0 ]; then
      echo -e "${RED}FAIL${NC}: dangerouslySetInnerHTML in $f (not in allowlist)"
      FAIL=1
    fi
  done <<< "$VIOLATIONS"
fi
[ $FAIL -eq 0 ] && echo -e "${GREEN}PASS${NC}"

echo "==> C-GATE-3: console.* outside wrappers/tests/error-boundaries"
ALLOW_RE='(^src/lib/logger\.ts$|^supabase/functions/_shared/logger\.ts$|^src/test/|/__tests__/|\.test\.|\.spec\.|^src/components/ErrorBoundary\.tsx$|^src/PublicApp\.tsx$)'
HITS=$(grep -rln -E 'console\.(log|warn|error|debug)' --include="*.ts" --include="*.tsx" src supabase/functions 2>/dev/null || true)
GATE3_FAIL=0
if [ -n "$HITS" ]; then
  while IFS= read -r f; do
    if ! echo "$f" | grep -qE "$ALLOW_RE"; then
      echo -e "${RED}FAIL${NC}: console.* in $f"
      grep -nE 'console\.(log|warn|error|debug)' "$f" | head -3
      GATE3_FAIL=1; FAIL=1
    fi
  done <<< "$HITS"
fi
[ $GATE3_FAIL -eq 0 ] && echo -e "${GREEN}PASS${NC}"

echo
if [ $FAIL -eq 0 ]; then
  echo -e "${GREEN}BLOCO C GATES PASSED${NC}"
  exit 0
else
  echo -e "${RED}BLOCO C GATES FAILED${NC}"
  exit 1
fi
