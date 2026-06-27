#!/usr/bin/env bash
# D11-E — Anti-regression gate for active @ts-nocheck in Tier 1 / type-clean files.
# Scope: ONLY protected paths below. Does NOT block the rest of supabase/functions
# (known debt tracked in D10 v2 inventory).
#
# Regex (validated in D11-A): matches active directives only, ignores JSDoc/docs.

set -uo pipefail

PATTERN='^[[:space:]]*(//|/\*)[[:space:]]*@ts-nocheck\b'

PROTECTED_PATHS=(
  # _shared (Tier 1 helpers)
  "supabase/functions/_shared/agent-auth.ts"
  "supabase/functions/_shared/serve-agent.ts"
  "supabase/functions/_shared/serve-tenant.ts"
  "supabase/functions/_shared/serve-internal.ts"
  "supabase/functions/_shared/error-handler.ts"
  "supabase/functions/_shared/hmac.ts"
  "supabase/functions/_shared/dlq.ts"
  "supabase/functions/_shared/hexagonal/adapters.ts"
  "supabase/functions/_shared/ai-multi-provider.ts"
  "supabase/functions/_shared/hmac-success-coalescer.ts"
  "supabase/functions/_shared/domain-events.ts"

  # _shared D12-B Onda 1
  "supabase/functions/_shared/ai-evidence-types.ts"
  "supabase/functions/_shared/ip-allowlist.ts"
  "supabase/functions/_shared/submit-handlers/web-activity-helpers.ts"
  "supabase/functions/_shared/submit-handlers/alert-engine.ts"

  # Agent runtime core (D2–D9)
  "supabase/functions/heartbeat/index.ts"
  "supabase/functions/heartbeat/state-updater.ts"
  "supabase/functions/poll-jobs/index.ts"
  "supabase/functions/ack-job/index.ts"
  "supabase/functions/submit-router/index.ts"
  "supabase/functions/submit-job-result/index.ts"
  "supabase/functions/register-agent-key/index.ts"
  "supabase/functions/register-agent-key/fingerprint-utils.ts"

  # Agent update / installer surface
  "supabase/functions/serve-agent-update/index.ts"
  "supabase/functions/confirm-force-update/index.ts"
  "supabase/functions/serve-installer/index.ts"
  "supabase/functions/serve-dns-filter/index.ts"

  # Public gateway (D11-D)
  "supabase/functions/public-gateway/index.ts"
  "supabase/functions/public-gateway/handlers/fido2-auth.ts"
  "supabase/functions/public-gateway/handlers/software-risk.ts"

  # External integrations
  "supabase/functions/stripe-webhook/index.ts"
  "supabase/functions/saml-sso/index.ts"
  "supabase/functions/scim-provisioning/index.ts"
  "supabase/functions/scim-provisioning/user-handlers.ts"
  "supabase/functions/scim-provisioning/group-handlers.ts"

  # D14-A1 — Billing (Tier A crítico)
  "supabase/functions/check-subscription/index.ts"
  "supabase/functions/create-checkout/index.ts"
  "supabase/functions/api-gateway/handlers/billing.ts"

  # D14-A2 — Auth / Identity (Tier A crítico)
  "supabase/functions/api-gateway/handlers/admin-auth.ts"
  "supabase/functions/api-gateway/handlers/enrollment.ts"
  "supabase/functions/auto-generate-enrollment/index.ts"
  "supabase/functions/enroll-agent/index.ts"
  "supabase/functions/enroll-agent/key-validator.ts"
  "supabase/functions/fido2-register/index.ts"
)

FOUND=0
MISSING=0

for path in "${PROTECTED_PATHS[@]}"; do
  if [[ -f "$path" ]]; then
    if grep -nE "$PATTERN" "$path"; then
      echo "  ^ active @ts-nocheck in protected file: $path"
      FOUND=1
    fi
  else
    echo "WARN: protected path not found (skipped): $path"
    MISSING=1
  fi
done

echo
if [[ "$FOUND" -ne 0 ]]; then
  echo "ERROR: active @ts-nocheck found in protected Tier 1 / type-clean files."
  echo "       Remove the directive or fix types — these files are post-cleanup and must stay clean."
  exit 1
fi

echo "PASS: no active @ts-nocheck in protected Tier 1 / type-clean files."
[[ "$MISSING" -ne 0 ]] && echo "NOTE: some protected paths were missing; review the list."
exit 0
