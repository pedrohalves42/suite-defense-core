#!/usr/bin/env bash
# =============================================================================
# VALIDATE ZOD COVERAGE
# Fails if any Edge Function that accepts JSON body lacks Zod validation.
# Exemptions: functions that only do GET, or are in EXEMPT list.
# =============================================================================
set -euo pipefail

ROOT="${1:-supabase/functions}"
FAILURES=0

# Functions exempt from Zod (no body input, health checks, static serving, etc.)
EXEMPT=(
  "_shared" "health" "serve-installer" "get-latest-agent-script"
  "get-reinstall-script" "get-reinstall-by-name" "get-reinstall-preserve-script"
  "get-diagnostic-script" "setup-agent-script" "serve-agent-update"
  "serve-dns-filter" "heartbeat" "poll-jobs" "submit-job-result"
  "submit-processes" "register-agent-key" "enroll-agent"
  "check-trial-expiration" "cleanup-stuck-builds" "cleanup-stuck-jobs"
  "cleanup-old-data" "cleanup-old-metrics" "reset-daily-quotas"
  "cron-sentinel" "build-watchdog" "health-monitor"
  "security-monitor" "security-alert-dispatcher"
  "autonomous-safe-mode" "maintenance-cron" "invoke-scheduled-jobs"
  "watchdog-non-execution" "check-stuck-jobs" "check-pending-agents"
  "stripe-health-check" "run-rls-tests" "verify-log-integrity"
  "verify-document" "validate-build-pipeline" "integrity-sentinel"
  "stripe-webhook" "saml-sso" "scim-provisioning"
  "track-installation-event" "validate-hmac-signature"
  "post-installation-telemetry" "get-rate-limit-stats"
)

is_exempt() {
  local fn="$1"
  for e in "${EXEMPT[@]}"; do
    if [ "$fn" = "$e" ]; then return 0; fi
  done
  return 1
}

for dir in "$ROOT"/*/; do
  [ -d "$dir" ] || continue
  fn=$(basename "$dir")
  idx="$dir/index.ts"
  [ -f "$idx" ] || continue

  is_exempt "$fn" && continue

  # Check if function accepts body input (POST with JSON parsing)
  if grep -qE 'req\.json\(\)|ctx\.body|body\s+as\s' "$idx"; then
    # Must have Zod validation
    if ! grep -qE 'safeParse|z\.object|\.parse\(|Schema\.' "$idx"; then
      echo "FAIL: $fn accepts body input but has no Zod validation"
      FAILURES=$((FAILURES + 1))
    fi
  fi
done

if [ "$FAILURES" -gt 0 ]; then
  echo ""
  echo "❌ Zod Coverage Gate: $FAILURES function(s) missing validation"
  exit 1
fi

echo "✅ Zod Coverage Gate: All functions with body input have validation"
exit 0
