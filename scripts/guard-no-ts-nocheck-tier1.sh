#!/usr/bin/env bash
# D11-E / Program Closure D2–D19 — Anti-regression gate for active @ts-nocheck
# AND @ts-ignore in Tier 1 / type-clean files.
#
# Post-closure policy (see docs/policies/16_type_safety_policy.md):
#   - @ts-nocheck and @ts-ignore are PROHIBITED in protected files. No exceptions.
#   - Type escapes (`as unknown as X`) must carry a `// type-escape:` justification.
#
# Regex (validated in D11-A): matches active directives only, ignores JSDoc/docs.

set -uo pipefail

PATTERN='^[[:space:]]*(//|/\*)[[:space:]]*@ts-(nocheck|ignore)\b'

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

  # D14-A3 — Public/Anti-abuse/HMAC surface (Tier A crítico)
  "supabase/functions/submit-hmac-router/index.ts"
  "supabase/functions/honeypot-handler/index.ts"
  "supabase/functions/check-tenant-abuse/index.ts"

  # D14-A4 — Public / Release / Signing (Tier A crítico)
  "supabase/functions/register-agent-release/index.ts"
  "supabase/functions/sign-release/index.ts"
  "supabase/functions/promote-agent-v5/index.ts"
  "supabase/functions/api-gateway/handlers/agent-ops.ts"
  "supabase/functions/api-gateway/handlers/security-advisor.ts"
  "supabase/functions/api-gateway/handlers/security-scanning.ts"
  "supabase/functions/api-gateway/handlers/security-threats.ts"

  # D15-B1 — Ops Gateway / Ops Playbook (Tier B operacional)
  "supabase/functions/ops-gateway/index.ts"
  "supabase/functions/ops-gateway/handlers/access-review.ts"
  "supabase/functions/ops-gateway/handlers/anomaly-ops.ts"
  "supabase/functions/ops-gateway/handlers/block-website.ts"
  "supabase/functions/ops-gateway/handlers/check-analytics.ts"
  "supabase/functions/ops-gateway/handlers/check-honeypot.ts"
  "supabase/functions/ops-gateway/handlers/cleanup.ts"
  "supabase/functions/ops-gateway/handlers/edr-ops.ts"
  "supabase/functions/ops-gateway/handlers/notify.ts"
  "supabase/functions/ops-gateway/handlers/playbook-analysis.ts"
  "supabase/functions/ops-gateway/handlers/playbook-automation.ts"
  "supabase/functions/ops-gateway/handlers/playbook-core.ts"
  "supabase/functions/ops-gateway/handlers/playbook.ts"
  "supabase/functions/ops-gateway/handlers/report-scheduled.ts"
  "supabase/functions/ops-gateway/handlers/security-ops.ts"
  "supabase/functions/ops-gateway/handlers/sync-infra.ts"
  "supabase/functions/ops-playbook/index.ts"
  "supabase/functions/ops-playbook/handlers/playbook-core.ts"
  "supabase/functions/ops-playbook/handlers/playbook-automation.ts"

  # D15-B2 — Ops Sync (Tier B operacional: jobs, DLQ, scheduler, EDR sync)
  "supabase/functions/ops-sync/index.ts"
  "supabase/functions/ops-sync/handlers/sync-jobs.ts"
  "supabase/functions/ops-sync/handlers/edr-ops.ts"

  # D15-B3 — Ops Reports (Tier B operacional: relatórios, evidências, uploads)
  "supabase/functions/ops-reports/index.ts"
  "supabase/functions/ops-reports/handlers/report-generators.ts"
  "supabase/functions/ops-reports/handlers/report-scheduled.ts"
  "supabase/functions/list-reports/index.ts"
  "supabase/functions/upload-report/index.ts"
  "supabase/functions/soc2-evidence-collector/index.ts"

  # D15-B4 — Automation Runtime (motor de regras / playbooks / remediação)
  "supabase/functions/evaluate-automation-rules/index.ts"
  "supabase/functions/evaluate-automation-rules/helpers.ts"
  "supabase/functions/evaluate-automation-rules/protection-pipeline.ts"
  "supabase/functions/evaluate-automation-rules/tenant-evaluator.ts"
  "supabase/functions/evaluate-automation-rules/trigger-evaluators.ts"
  "supabase/functions/evaluate-playbook-triggers/index.ts"
  "supabase/functions/evaluate-playbook-triggers/approval-handler.ts"
  "supabase/functions/evaluate-playbook-triggers/condition-engine.ts"
  "supabase/functions/execute-playbook-action/index.ts"
  "supabase/functions/execute-playbook-action/action-dispatcher.ts"
  "supabase/functions/execute-playbook-action/handlers/agent-jobs.ts"
  "supabase/functions/execute-playbook-action/handlers/notify.ts"
  "supabase/functions/execute-playbook-action/handlers/security.ts"
  "supabase/functions/auto-remediate/index.ts"
  "supabase/functions/autonomous-safe-mode/index.ts"
  "supabase/functions/autonomous-safe-mode/rules/agent-health.ts"
  "supabase/functions/autonomous-safe-mode/rules/quality.ts"
  "supabase/functions/autonomous-safe-mode/rules/security.ts"

  # D16-C1 — AI Core (Tier C: router + audit + agent-assist)
  "supabase/functions/ai-router/index.ts"
  "supabase/functions/ai-router/handlers/correlate-alerts.ts"
  "supabase/functions/ai-router/handlers/execute-solution.ts"
  "supabase/functions/ai-router/handlers/security-copilot.ts"
  "supabase/functions/ai-system-audit/index.ts"
  "supabase/functions/ai-system-audit/dimension-mapper.ts"
  "supabase/functions/ai-agent-assist/index.ts"

  # D16-C2 — AI Analysis (Tier C: analyze / predict / quality / full-audit)
  "supabase/functions/ai-analyze-agent/index.ts"
  "supabase/functions/ai-full-audit/index.ts"
  "supabase/functions/ai-full-audit/helpers.ts"
  "supabase/functions/ai-predict-agent-failure/index.ts"
  "supabase/functions/ai-predict-agent-failure/trend-analyzer.ts"
  "supabase/functions/ai-quality-check/index.ts"
  "supabase/functions/ai-quality-check/handlers.ts"

  # D16-C3 — AI Security/Closure (Tier C: action-executor / insight-dispatcher / red-team / system-analyzer)
  "supabase/functions/ai-action-executor/index.ts"
  "supabase/functions/ai-action-executor/handlers.ts"
  "supabase/functions/ai-insight-dispatcher/index.ts"
  "supabase/functions/ai-insight-dispatcher/action-guards.ts"
  "supabase/functions/ai-insight-dispatcher/mode-handlers.ts"
  "supabase/functions/ai-insight-dispatcher/types.ts"
  "supabase/functions/ai-red-team-assessment/index.ts"
  "supabase/functions/ai-red-team-assessment/assessment-saver.ts"
  "supabase/functions/ai-red-team-assessment/deterministic-fallback.ts"
  "supabase/functions/ai-red-team-assessment/metrics-collector.ts"
  "supabase/functions/ai-red-team-assessment/types.ts"
  "supabase/functions/ai-system-analyzer/index.ts"
  "supabase/functions/ai-system-analyzer/analysis-engine.ts"
  "supabase/functions/ai-system-analyzer/tenant-eligibility.ts"
  "supabase/functions/ai-system-analyzer/types.ts"

  # D17-D1 — Build / Release
  "supabase/functions/build-agent-exe/index.ts"
  "supabase/functions/build-agent-exe/cache.ts"
  "supabase/functions/generate-deploy-package/index.ts"
  "supabase/functions/generate-portable-installer/index.ts"
  "supabase/functions/upload-release-content/index.ts"
  "supabase/functions/validate-build-pipeline/index.ts"
  "supabase/functions/setup-agent-script/index.ts"
  "supabase/functions/get-agent-script-content/index.ts"

  # D17-D2 — Agent Deployment (Tier B operacional: deployment/distribuição)
  "supabase/functions/check-agent-updates/index.ts"
  "supabase/functions/get-agent-config/index.ts"
  "supabase/functions/get-agent-policy/index.ts"
  "supabase/functions/get-diagnostic-script/index.ts"
  "supabase/functions/diagnostics-agent-logs/index.ts"
  "supabase/functions/create-reinstall-jobs/index.ts"
  "supabase/functions/force-reinstall-fleet/index.ts"
  "supabase/functions/post-installation-telemetry/index.ts"

  # D17-D3 — Wave final (orquestradores e routers de coleta/scan)
  "supabase/functions/collect-router/index.ts"
  "supabase/functions/get-blocked-websites/index.ts"
  "supabase/functions/get-latest-agent-script/index.ts"
  "supabase/functions/scan-virus/index.ts"
  "supabase/functions/scan-vulnerabilities/index.ts"
  "supabase/functions/update-baseline/index.ts"
  "supabase/functions/action-center-feed/index.ts"
)

FOUND=0
MISSING=0

for path in "${PROTECTED_PATHS[@]}"; do
  if [[ -f "$path" ]]; then
    if grep -nE "$PATTERN" "$path"; then
      echo "  ^ active @ts-nocheck/@ts-ignore in protected file: $path"
      FOUND=1
    fi
  else
    echo "WARN: protected path not found (skipped): $path"
    MISSING=1
  fi
done

echo
if [[ "$FOUND" -ne 0 ]]; then
  echo "ERROR: active @ts-nocheck or @ts-ignore found in protected Tier 1 / type-clean files."
  echo "       Policy: docs/policies/16_type_safety_policy.md — these directives are prohibited."
  echo "       Fix the underlying type error; do not suppress it."
  exit 1
fi

echo "PASS: no active @ts-nocheck/@ts-ignore in protected Tier 1 / type-clean files."
[[ "$MISSING" -ne 0 ]] && echo "NOTE: some protected paths were missing; review the list."
exit 0
