#!/usr/bin/env bash
# =============================================================================
# VALIDATE MIDDLEWARE USAGE
# Fails if any Edge Function uses raw Deno.serve() without being in the
# approved exceptions list (documented in deno-serve-migration-exceptions.md).
# =============================================================================
set -euo pipefail

ROOT="${1:-supabase/functions}"
FAILURES=0

# Approved raw Deno.serve exceptions (HMAC/webhook/router architecture)
EXCEPTIONS=(
  "api-gateway"
  "ops-gateway"
  "notification-router"
  "ops-router"
  "heartbeat"
  "poll-jobs"
  "submit-job-result"
  "submit-processes"
  "register-agent-key"
  "enroll-agent"
  "stripe-webhook"
  "saml-sso"
  "scim-provisioning"
)

is_exception() {
  local fn="$1"
  for e in "${EXCEPTIONS[@]}"; do
    if [ "$fn" = "$e" ]; then return 0; fi
  done
  return 1
}

for dir in "$ROOT"/*/; do
  [ -d "$dir" ] || continue
  fn=$(basename "$dir")
  idx="$dir/index.ts"
  [ -f "$idx" ] || continue
  [ "$fn" = "_shared" ] && continue

  if grep -q 'Deno\.serve(' "$idx"; then
    if ! is_exception "$fn"; then
      echo "FAIL: $fn uses raw Deno.serve() without approved exception"
      FAILURES=$((FAILURES + 1))
    fi
  fi
done

if [ "$FAILURES" -gt 0 ]; then
  echo ""
  echo "❌ Middleware Gate: $FAILURES function(s) using unauthorized raw Deno.serve"
  exit 1
fi

echo "✅ Middleware Gate: All raw Deno.serve usage is authorized"
exit 0
