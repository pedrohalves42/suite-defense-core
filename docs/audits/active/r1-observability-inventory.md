# R1 — Observability Inventory (READ-ONLY)

## Provenance

- **Collected at:** `2026-07-02 13:36:04Z`
- **Commit SHA:** `2202f2d75a5990afe50f007ec968b3013bdb5b71`
- **Migration head:** `20260701202145_658758a3-ab66-45ba-9d9e-2cc20c06abf2.sql`
- **Edge Functions scanned:** 74
- **Generator:** `tools/reports/observability_inventory.py`
- **Scope:** static analysis of `supabase/functions/*/index.ts`. No runtime, no DB queries, no code changes.

## Executive summary

```
Edge Functions: 74

COMPLETE:
  1

PARTIAL:
  5

MINIMAL:
  55

NONE:
  13

```

## Classification rules (deterministic)

A function is scored across 9 observability signals. Reliability signals
are inventoried but **not** used for classification (per R1 scope).

| Status   | Rule                                          |
|----------|-----------------------------------------------|
| COMPLETE | 9 of 9 observability signals present          |
| PARTIAL  | 6–8 signals present                           |
| MINIMAL  | 3–5 signals present                           |
| NONE     | 0–2 signals present                           |

## Detection heuristics (documented, so a reader can spot false negatives)

| Signal              | Positive when the source contains …                                          |
|---------------------|------------------------------------------------------------------------------|
| structured_logs     | import of `_shared/logger`, `logger.<level>(...)`, or `loggerWithContext(...)` |
| correlation_id      | `X-Request-ID` header, `requestId`, or `correlation_id` token                 |
| request_id_header   | function reads/echoes `x-request-id` / `x-trace-id` header                    |
| tenant_logged       | tenantId passed into logger context or log payload                            |
| auth_uid_logged     | userId/uid passed into logger context or log payload                          |
| duration_tracked    | explicit `duration_ms`, or `start = Date.now()` … `Date.now() - start`        |
| metrics             | import of `_shared/apm`, `recordMetric(...)`, or writes to `performance_metrics` / `edge_function_metrics` |
| error_structured    | `logger.error(...)` is used; a function that only has `console.error` fails   |
| audit_logging       | import of `_shared/audit`, `createAuditLog(...)`, or writes to `audit_logs`   |
| timeout             | `AbortSignal.timeout(...)` or `new AbortController()`                         |
| retry               | `retry:` / `maxRetries` / `attempt <` / `backoff`                             |
| circuit_breaker     | import of `ai-circuit-breaker`, or `circuit_breaker` token                    |
| idempotency         | `idempotency_key`, `Idempotency-Key` header, or `dedup*`                      |

## Coverage matrix

Observability (used for classification):

| Function | Status | logs | corrId | reqIdHdr | tenant | uid | duration | metrics | errLog | audit |
|---|---|---|---|---|---|---|---|---|---|---|
| `ack-job` | **MINIMAL** | ✅ | ✅ | — | — | — | — | — | ✅ | — |
| `action-center-feed` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `ai-action-executor` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `ai-agent-assist` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `ai-analyze-agent` | **NONE** | ✅ | — | — | — | — | — | — | — | — |
| `ai-full-audit` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `ai-insight-dispatcher` | **MINIMAL** | ✅ | — | — | ✅ | — | — | — | ✅ | — |
| `ai-predict-agent-failure` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `ai-quality-check` | **NONE** | ✅ | — | — | ✅ | — | — | — | — | — |
| `ai-red-team-assessment` | **MINIMAL** | ✅ | — | — | ✅ | — | — | — | ✅ | — |
| `ai-router` | **MINIMAL** | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅ | — |
| `ai-system-analyzer` | **MINIMAL** | ✅ | — | — | ✅ | — | — | — | ✅ | — |
| `ai-system-audit` | **MINIMAL** | ✅ | — | — | ✅ | — | — | — | ✅ | — |
| `api-gateway` | **PARTIAL** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| `auto-generate-enrollment` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | ✅ | ✅ | — |
| `auto-remediate` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | ✅ |
| `autonomous-safe-mode` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `build-agent-exe` | **MINIMAL** | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ | — |
| `check-agent-updates` | **NONE** | ✅ | ✅ | — | — | — | — | — | — | — |
| `check-subscription` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | ✅ |
| `check-tenant-abuse` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `cleanup-router` | **MINIMAL** | ✅ | ✅ | — | — | — | — | — | ✅ | — |
| `collect-router` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `confirm-force-update` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `create-checkout` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | ✅ |
| `create-reinstall-jobs` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `diagnostics-agent-logs` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `enroll-agent` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | ✅ |
| `evaluate-automation-rules` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `evaluate-playbook-triggers` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | ✅ |
| `execute-playbook-action` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | ✅ |
| `fido2-register` | **MINIMAL** | ✅ | ✅ | — | — | ✅ | — | — | — | — |
| `force-reinstall-fleet` | **MINIMAL** | ✅ | ✅ | — | ✅ | ✅ | — | — | — | — |
| `generate-deploy-package` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `generate-portable-installer` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `get-agent-config` | **NONE** | ✅ | ✅ | — | — | — | — | — | — | — |
| `get-agent-policy` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `get-agent-script-content` | **MINIMAL** | ✅ | ✅ | — | — | ✅ | — | — | ✅ | — |
| `get-blocked-websites` | **MINIMAL** | ✅ | — | — | ✅ | — | — | — | ✅ | — |
| `get-diagnostic-script` | **NONE** | — | ✅ | — | — | — | — | — | — | — |
| `get-latest-agent-script` | **NONE** | — | ✅ | — | — | — | — | — | — | — |
| `heartbeat` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `honeypot-handler` | **MINIMAL** | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅ | — |
| `list-reports` | **NONE** | ✅ | — | — | — | — | — | — | — | — |
| `ops-checks` | **PARTIAL** | ✅ | ✅ | — | ✅ | — | ✅ | ✅ | ✅ | — |
| `ops-gateway` | **COMPLETE** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| `ops-playbook` | **PARTIAL** | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | ✅ |
| `ops-reports` | **PARTIAL** | ✅ | ✅ | — | ✅ | ✅ | ✅ | — | ✅ | ✅ |
| `ops-sync` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | ✅ | — | ✅ | — |
| `poll-jobs` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `post-installation-telemetry` | **MINIMAL** | ✅ | ✅ | — | ✅ | ✅ | — | — | ✅ | — |
| `promote-agent-v5` | **NONE** | ✅ | — | — | — | — | — | — | ✅ | — |
| `public-gateway` | **PARTIAL** | ✅ | ✅ | ✅ | ✅ | — | — | — | ✅ | ✅ |
| `register-agent-key` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `register-agent-release` | **MINIMAL** | ✅ | ✅ | — | — | — | — | — | ✅ | — |
| `run-rls-tests` | **NONE** | — | — | — | — | — | — | — | — | — |
| `saml-sso` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | ✅ |
| `scan-virus` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `scan-vulnerabilities` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `scim-provisioning` | **MINIMAL** | ✅ | — | — | ✅ | — | — | — | ✅ | ✅ |
| `serve-agent-update` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `serve-dns-filter` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `serve-installer` | **NONE** | — | ✅ | — | — | — | — | — | — | — |
| `setup-agent-script` | **MINIMAL** | ✅ | ✅ | — | — | — | — | — | ✅ | — |
| `sign-release` | **NONE** | ✅ | ✅ | — | — | — | — | — | — | — |
| `soc2-evidence-collector` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | ✅ |
| `stripe-webhook` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `submit-hmac-router` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `submit-job-result` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `submit-router` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `update-baseline` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | ✅ | — |
| `upload-release-content` | **NONE** | ✅ | ✅ | — | — | — | — | — | — | — |
| `upload-report` | **MINIMAL** | ✅ | ✅ | — | ✅ | — | — | — | — | — |
| `validate-build-pipeline` | **NONE** | ✅ | — | — | — | ✅ | — | — | — | — |

Reliability metadata (inventoried only, not scored):

| Function | timeout | retry | circuit_breaker | idempotency |
|---|---|---|---|---|
| `ack-job` | — | — | — | — |
| `action-center-feed` | — | — | — | — |
| `ai-action-executor` | — | — | — | — |
| `ai-agent-assist` | — | — | — | — |
| `ai-analyze-agent` | — | — | — | — |
| `ai-full-audit` | — | — | — | — |
| `ai-insight-dispatcher` | — | — | — | — |
| `ai-predict-agent-failure` | — | — | — | — |
| `ai-quality-check` | — | — | — | — |
| `ai-red-team-assessment` | — | — | — | — |
| `ai-router` | — | — | — | — |
| `ai-system-analyzer` | — | — | — | — |
| `ai-system-audit` | — | — | — | — |
| `api-gateway` | — | ✅ | — | — |
| `auto-generate-enrollment` | — | — | — | — |
| `auto-remediate` | — | — | — | — |
| `autonomous-safe-mode` | — | — | — | — |
| `build-agent-exe` | — | ✅ | — | — |
| `check-agent-updates` | — | — | — | — |
| `check-subscription` | — | — | — | — |
| `check-tenant-abuse` | — | — | — | — |
| `cleanup-router` | — | — | — | — |
| `collect-router` | — | — | — | — |
| `confirm-force-update` | — | — | — | — |
| `create-checkout` | — | — | — | — |
| `create-reinstall-jobs` | — | — | — | — |
| `diagnostics-agent-logs` | — | — | — | — |
| `enroll-agent` | — | — | — | — |
| `evaluate-automation-rules` | — | — | — | ✅ |
| `evaluate-playbook-triggers` | — | — | — | — |
| `execute-playbook-action` | — | — | — | — |
| `fido2-register` | — | — | — | — |
| `force-reinstall-fleet` | — | — | — | — |
| `generate-deploy-package` | — | — | — | — |
| `generate-portable-installer` | — | — | — | — |
| `get-agent-config` | — | — | — | — |
| `get-agent-policy` | — | — | — | — |
| `get-agent-script-content` | — | — | — | — |
| `get-blocked-websites` | — | — | — | — |
| `get-diagnostic-script` | — | — | — | — |
| `get-latest-agent-script` | — | — | — | — |
| `heartbeat` | — | — | — | — |
| `honeypot-handler` | — | — | — | — |
| `list-reports` | — | — | — | — |
| `ops-checks` | — | — | — | — |
| `ops-gateway` | — | ✅ | — | — |
| `ops-playbook` | — | — | — | — |
| `ops-reports` | — | — | — | — |
| `ops-sync` | — | ✅ | — | — |
| `poll-jobs` | — | — | — | — |
| `post-installation-telemetry` | — | — | — | — |
| `promote-agent-v5` | — | — | — | — |
| `public-gateway` | — | — | — | — |
| `register-agent-key` | — | — | — | ✅ |
| `register-agent-release` | — | — | — | — |
| `run-rls-tests` | — | — | — | — |
| `saml-sso` | — | — | — | — |
| `scan-virus` | — | — | — | — |
| `scan-vulnerabilities` | — | — | — | — |
| `scim-provisioning` | — | — | — | — |
| `serve-agent-update` | — | — | — | — |
| `serve-dns-filter` | — | — | — | — |
| `serve-installer` | — | — | — | — |
| `setup-agent-script` | — | — | — | — |
| `sign-release` | — | — | — | — |
| `soc2-evidence-collector` | — | — | — | — |
| `stripe-webhook` | — | — | — | — |
| `submit-hmac-router` | — | — | — | — |
| `submit-job-result` | — | — | — | — |
| `submit-router` | — | — | — | — |
| `update-baseline` | — | — | — | — |
| `upload-release-content` | — | — | — | — |
| `upload-report` | — | — | — | — |
| `validate-build-pipeline` | — | — | — | — |

## Gaps by category

Grouped enumeration only — R1 does not propose remediation.

### Functions without structured logger (4/74)

`get-diagnostic-script`, `get-latest-agent-script`, `run-rls-tests`, `serve-installer`

### Functions without correlation ID (12/74)

`ai-analyze-agent`, `ai-insight-dispatcher`, `ai-quality-check`, `ai-red-team-assessment`, `ai-system-analyzer`, `ai-system-audit`, `get-blocked-websites`, `list-reports`, `promote-agent-v5`, `run-rls-tests`, `scim-provisioning`, `validate-build-pipeline`

### Functions that do not read/echo request-id header (69/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-system-analyzer`, `ai-system-audit`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `build-agent-exe`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `list-reports`, `ops-checks`, `ops-playbook`, `ops-reports`, `ops-sync`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions not logging tenant_id (18/74)

`ack-job`, `ai-analyze-agent`, `check-agent-updates`, `cleanup-router`, `fido2-register`, `get-agent-config`, `get-agent-script-content`, `get-diagnostic-script`, `get-latest-agent-script`, `list-reports`, `promote-agent-v5`, `register-agent-release`, `run-rls-tests`, `serve-installer`, `setup-agent-script`, `sign-release`, `upload-release-content`, `validate-build-pipeline`

### Functions not logging auth uid / user_id (65/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `ops-checks`, `ops-playbook`, `ops-sync`, `poll-jobs`, `promote-agent-v5`, `public-gateway`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`

### Functions without duration tracking (68/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `build-agent-exe`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `public-gateway`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions without metrics (APM / performance_metrics) (71/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `api-gateway`, `auto-remediate`, `autonomous-safe-mode`, `build-agent-exe`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `ops-playbook`, `ops-reports`, `ops-sync`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `public-gateway`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions without structured error logging (`logger.error`) (24/74)

`ai-action-executor`, `ai-analyze-agent`, `ai-predict-agent-failure`, `ai-quality-check`, `check-agent-updates`, `check-subscription`, `confirm-force-update`, `create-checkout`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `get-agent-config`, `get-agent-policy`, `get-diagnostic-script`, `get-latest-agent-script`, `list-reports`, `run-rls-tests`, `serve-dns-filter`, `serve-installer`, `sign-release`, `submit-hmac-router`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions without audit logging (60/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `auto-generate-enrollment`, `autonomous-safe-mode`, `build-agent-exe`, `check-agent-updates`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `evaluate-automation-rules`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `ops-checks`, `ops-sync`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `scan-virus`, `scan-vulnerabilities`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions without fetch timeout / AbortController (74/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `api-gateway`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `build-agent-exe`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `ops-checks`, `ops-gateway`, `ops-playbook`, `ops-reports`, `ops-sync`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `public-gateway`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions without retry logic (70/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `ops-checks`, `ops-playbook`, `ops-reports`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `public-gateway`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions without circuit breaker (74/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `api-gateway`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `build-agent-exe`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `ops-checks`, `ops-gateway`, `ops-playbook`, `ops-reports`, `ops-sync`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `public-gateway`, `register-agent-key`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`

### Functions without idempotency signal (72/74)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `api-gateway`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `build-agent-exe`, `check-agent-updates`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `heartbeat`, `honeypot-handler`, `list-reports`, `ops-checks`, `ops-gateway`, `ops-playbook`, `ops-reports`, `ops-sync`, `poll-jobs`, `post-installation-telemetry`, `promote-agent-v5`, `public-gateway`, `register-agent-release`, `run-rls-tests`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `serve-installer`, `setup-agent-script`, `sign-release`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-release-content`, `upload-report`, `validate-build-pipeline`


## Call graph (frontend → function → RPC / table)

Static extraction. `callers` are files under `src/`, `e2e/`, `tests/`, `contracts/` that invoke the function via `supabase.functions.invoke('<name>')`. `rpcs` and `tables` are extracted from the function's own source.

| Function | Callers | RPCs called | Tables touched |
|----------|--------:|-------------|----------------|
| `ack-job` | 0 · — | — | `agent_evidence_logs`, `jobs` |
| `action-center-feed` | 0 · — | — | `agents`, `ai_actions`, `ai_insights`, `decision_events`, `jobs`, `playbook_executions` (+1) |
| `ai-action-executor` | 0 · — | `check_action_rate_limit` | `agent_tokens`, `agents`, `ai_action_configs`, `ai_action_executions`, `ai_actions`, `jobs` (+4) |
| `ai-agent-assist` | 0 · — | — | `agent_evidence_logs` |
| `ai-analyze-agent` | 0 · — | — | — |
| `ai-full-audit` | 0 · — | `get_audit_raw_metrics`, `get_previous_audit_score` | `audit_confidence_gaps`, `red_team_assessments`, `score_governance_log`, `system_audits` |
| `ai-insight-dispatcher` | 0 · — | — | `ai_action_configs`, `ai_action_executions`, `ai_insights`, `playbook_executions`, `playbooks` |
| `ai-predict-agent-failure` | 0 · — | `get_system_mode_safe` | `agent_system_metrics_partitioned`, `agents`, `ai_insights`, `tenants` |
| `ai-quality-check` | 0 · — | — | `ai_inference_metrics` |
| `ai-red-team-assessment` | 0 · — | `get_audit_raw_metrics` | `red_team_assessments`, `system_audits` |
| `ai-router` | 2 · e.g. `src/pages/admin/AIActionApproval/hooks/useAIActionApprovalData.ts` | `acknowledge_all_alerts`, `cleanup_stuck_jobs`, `get_system_mode_safe` | `agents`, `ai_actions`, `ai_insights`, `jobs`, `security_alerts`, `system_alerts` (+2) |
| `ai-system-analyzer` | 0 · — | `get_system_mode_safe`, `log_scheduled_job_run` | `agent_system_metrics_partitioned`, `agents`, `ai_actions`, `ai_insights`, `installation_analytics`, `jobs` (+6) |
| `ai-system-audit` | 0 · — | `get_audit_raw_metrics` | `system_audits` |
| `api-gateway` | 7 · e.g. `src/hooks/useAutoRemediation.ts` | `calculate_next_run`, `check_agent_job_failure_rate`, `check_blast_radius`, `check_global_circuit_breaker`, `check_super_admin_ip_access`, `create_job_if_not_exists` (+11) | `agent_antivirus_status`, `agent_builds`, `agent_certificates`, `agent_execution_chain`, `agent_network_info`, `agent_processes` (+63) |
| `auto-generate-enrollment` | 3 · e.g. `src/pages/AgentInstaller/hooks/useAgentCredentials.ts` | — | `agent_tokens`, `agents`, `enrollment_keys` |
| `auto-remediate` | 0 · — | `check_blast_radius`, `check_global_circuit_breaker` | `agents`, `auto_remediation_actions`, `domain_events`, `jobs`, `system_alerts` |
| `autonomous-safe-mode` | 1 · e.g. `src/hooks/useAgentActions.ts` | `apply_agent_isolation`, `apply_agent_throttle`, `apply_version_block`, `detect_critical_failure_pattern`, `detect_improdutive_agents`, `detect_isolation_candidates` (+9) | `agent_system_metrics`, `agents`, `ai_insights`, `blocked_access_attempts`, `decision_events`, `decision_rules` (+3) |
| `build-agent-exe` | 1 · e.g. `src/pages/AgentInstaller/hooks/useAgentBuild.ts` | — | `agent_builds`, `agents`, `enrollment_keys`, `user_roles` |
| `check-agent-updates` | 0 · — | — | `agent_releases` |
| `check-subscription` | 0 · — | — | `subscription_plans`, `tenant_subscriptions` |
| `check-tenant-abuse` | 0 · — | `get_tenant_abuse_metrics` | `system_alerts` |
| `cleanup-router` | 0 · — | `cleanup_agent_hmac_signatures` | `agents` |
| `collect-router` | 0 · — | `log_scheduled_job_run` | `agent_certificates`, `agent_usb_devices`, `security_policies`, `system_alerts` |
| `confirm-force-update` | 0 · — | — | `agent_evidence_logs`, `agents` |
| `create-checkout` | 0 · — | — | `stripe_plan_mapping` |
| `create-reinstall-jobs` | 0 · — | `check_blast_radius` | `agents`, `jobs` |
| `diagnostics-agent-logs` | 0 · — | — | `installation_analytics` |
| `enroll-agent` | 0 · — | `enroll_agent_atomic`, `revive_agent_on_reenroll` | `agent_tokens`, `agents`, `enrollment_keys`, `feature_flags`, `tenant_security_policies` |
| `evaluate-automation-rules` | 0 · — | `check_and_update_circuit_breaker`, `check_global_circuit_breaker`, `check_rule_dependencies`, `check_tenant_automation_quota`, `get_adaptive_blast_radius`, `increment_tenant_quota` (+3) | `agent_evidence_logs`, `agent_processes`, `agent_system_metrics_partitioned`, `agent_usb_devices`, `agents`, `antivirus_status` (+9) |
| `evaluate-playbook-triggers` | 1 · e.g. `src/hooks/usePlaybooks.ts` | `has_recent_playbook_execution`, `requires_human_review`, `should_auto_execute_playbook` | `agents`, `approval_requests`, `audit_logs`, `playbook_executions`, `playbooks`, `risk_decision_log` (+3) |
| `execute-playbook-action` | 1 · e.g. `src/hooks/usePlaybooks.ts` | — | `agent_evidence_logs`, `agent_tokens`, `agents`, `approval_requests`, `audit_logs`, `jobs` (+6) |
| `fido2-register` | 0 · — | — | `fido2_credentials`, `session_store` |
| `force-reinstall-fleet` | 0 · — | — | `agent_releases`, `agents`, `enrollment_keys`, `user_roles` |
| `generate-deploy-package` | 0 · — | — | `enrollment_keys`, `tenants` |
| `generate-portable-installer` | 1 · e.g. `src/pages/AgentInstaller/hooks/useAgentCredentials.ts` | — | `agent_builds`, `agents`, `enrollment_keys` |
| `get-agent-config` | 0 · — | — | `agent_light_mode_configs` |
| `get-agent-policy` | 0 · — | — | `agent_releases`, `blocked_websites`, `tenant_settings`, `tenant_version_policies` |
| `get-agent-script-content` | 1 · e.g. `src/hooks/useAdminAgentReleases.tsx` | `has_role` | `agent_releases` |
| `get-blocked-websites` | 0 · — | — | `agents_groups`, `blocked_websites`, `security_policy_rules` |
| `get-diagnostic-script` | 0 · — | — | — |
| `get-latest-agent-script` | 0 · — | — | — |
| `heartbeat` | 1 · e.g. `e2e/agent-scheduled-task-parameters.spec.ts` | — | `agent_processes`, `agent_releases`, `agent_system_metrics_partitioned`, `agent_tokens`, `agents` |
| `honeypot-handler` | 0 · — | — | `agents`, `honeypot_interactions` |
| `list-reports` | 0 · — | — | `reports` |
| `ops-checks` | 0 · — | `calculate_pipeline_metrics`, `check_job_health_anomalies_and_alert`, `check_task_sla_breach`, `detect_blocked_access_attempts`, `evaluate_job_slo` | `agent_actions`, `agent_behavioral_baseline`, `agent_builds`, `agent_evidence_logs`, `agent_processes`, `agent_web_activity` (+12) |
| `ops-gateway` | 9 · e.g. `src/components/admin/ComplianceReportGenerator/reportService.ts` | `calculate_next_run`, `check_action_rate_limit`, `check_agent_job_failure_rate`, `check_blast_radius`, `cleanup_expired_telemetry`, `cleanup_hmac_nonces` (+25) | `agent_behavioral_baseline`, `agent_events`, `agent_evidence_logs`, `agent_processes`, `agent_quarantine`, `agent_releases` (+90) |
| `ops-playbook` | 0 · — | `check_action_rate_limit`, `check_blast_radius`, `cleanup_stuck_jobs`, `get_balanced_pending_actions`, `get_system_mode_safe`, `log_scheduled_job_run` (+1) | `agents`, `ai_action_configs`, `ai_action_executions`, `ai_action_logs`, `ai_actions`, `ai_insights` (+15) |
| `ops-reports` | 0 · — | `get_tenant_risk_score`, `log_scheduled_job_run` | `agent_evidence_logs`, `agent_web_activity`, `agents`, `ai_insights`, `antivirus_status`, `approval_requests` (+21) |
| `ops-sync` | 0 · — | `calculate_next_run`, `create_job_if_not_exists`, `get_system_mode_safe`, `log_scheduled_job_run` | `correlated_incident_events`, `correlated_incidents`, `correlation_rules`, `cve_database`, `detection_rules`, `endpoint_detection_events` (+4) |
| `poll-jobs` | 0 · — | `claim_jobs_for_agent` | `agent_tokens`, `agents`, `jobs` |
| `post-installation-telemetry` | 1 · e.g. `e2e/agent-scheduled-task-parameters.spec.ts` | — | `installation_analytics`, `user_roles` |
| `promote-agent-v5` | 0 · — | — | `agent_releases`, `agent_versions`, `user_roles` |
| `public-gateway` | 2 · e.g. `src/pages/AgentInstaller/hooks/useAgentCredentials.ts` | `check_and_block_ip` | `agent_releases`, `agent_tokens`, `agents`, `approval_requests`, `audit_logs`, `audit_report_verifications` (+19) |
| `register-agent-key` | 0 · — | `register_agent_signing_key` | `agent_signing_keys` |
| `register-agent-release` | 1 · e.g. `src/hooks/useAgentReleases.tsx` | — | `agent_releases`, `agent_versions`, `user_roles` |
| `run-rls-tests` | 2 · e.g. `src/components/security/RLSTestRunner.tsx` | `has_role` | `ai_insights`, `rls_test_results`, `security_logs` |
| `saml-sso` | 0 · — | — | `audit_logs`, `saml_configs`, `session_store`, `user_roles` |
| `scan-virus` | 0 · — | `update_quota_usage` | `virus_scans` |
| `scan-vulnerabilities` | 1 · e.g. `src/pages/admin/VulnerabilityFindings.tsx` | — | `agents`, `cve_database`, `software_inventory`, `vuln_findings` |
| `scim-provisioning` | 0 · — | — | `audit_logs`, `group_members`, `scim_groups`, `tenants`, `user_roles` |
| `serve-agent-update` | 0 · — | — | `agent_releases`, `agent_update_decisions`, `agent_update_policies`, `agents` |
| `serve-dns-filter` | 0 · — | — | `blocked_websites`, `dns_filter_policies`, `tenant_settings` |
| `serve-installer` | 1 · e.g. `e2e/agent-scheduled-task-parameters.spec.ts` | — | — |
| `setup-agent-script` | 0 · — | — | `agent_releases` |
| `sign-release` | 0 · — | — | `agent_releases`, `agent_versions`, `signed_documents`, `user_roles` |
| `soc2-evidence-collector` | 0 · — | — | `agents`, `alert_rules`, `audit_logs`, `compliance_policies`, `enrollment_keys`, `soc2_controls` (+2) |
| `stripe-webhook` | 0 · — | `ensure_tenant_features` | `stripe_plan_mapping`, `subscription_events`, `subscription_plans`, `system_alerts`, `tenant_subscriptions` |
| `submit-hmac-router` | 0 · — | — | — |
| `submit-job-result` | 0 · — | `finalize_job_execution` | `agent_certificates`, `agent_disk_metrics`, `agent_network_info`, `agent_web_activity`, `agents`, `antivirus_status` (+6) |
| `submit-router` | 0 · — | — | `agent_evidence_logs`, `agent_network_info`, `agent_process_lineage`, `backup_status`, `data_exposure_findings`, `endpoint_event_buffer` (+2) |
| `update-baseline` | 0 · — | `log_scheduled_job_run` | `agent_behavioral_baseline`, `system_alerts` |
| `upload-release-content` | 0 · — | — | `agent_releases`, `agent_versions` |
| `upload-report` | 0 · — | — | `reports` |
| `validate-build-pipeline` | 0 · — | — | `agent_builds`, `user_roles` |

## Functions grouped by status

### COMPLETE (1)

`ops-gateway`

### PARTIAL (5)

`api-gateway`, `ops-checks`, `ops-playbook`, `ops-reports`, `public-gateway`

### MINIMAL (55)

`ack-job`, `action-center-feed`, `ai-action-executor`, `ai-agent-assist`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-red-team-assessment`, `ai-router`, `ai-system-analyzer`, `ai-system-audit`, `auto-generate-enrollment`, `auto-remediate`, `autonomous-safe-mode`, `build-agent-exe`, `check-subscription`, `check-tenant-abuse`, `cleanup-router`, `collect-router`, `confirm-force-update`, `create-checkout`, `create-reinstall-jobs`, `diagnostics-agent-logs`, `enroll-agent`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `execute-playbook-action`, `fido2-register`, `force-reinstall-fleet`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `heartbeat`, `honeypot-handler`, `ops-sync`, `poll-jobs`, `post-installation-telemetry`, `register-agent-key`, `register-agent-release`, `saml-sso`, `scan-virus`, `scan-vulnerabilities`, `scim-provisioning`, `serve-agent-update`, `serve-dns-filter`, `setup-agent-script`, `soc2-evidence-collector`, `stripe-webhook`, `submit-hmac-router`, `submit-job-result`, `submit-router`, `update-baseline`, `upload-report`

### NONE (13)

`ai-analyze-agent`, `ai-quality-check`, `check-agent-updates`, `get-agent-config`, `get-diagnostic-script`, `get-latest-agent-script`, `list-reports`, `promote-agent-v5`, `run-rls-tests`, `serve-installer`, `sign-release`, `upload-release-content`, `validate-build-pipeline`


## R1 closure contract

This artifact satisfies the four deliverables authorized for R1:

1. ✅ Executive summary (COMPLETE / PARTIAL / MINIMAL / NONE counts).
2. ✅ Complete matrix, one row per function.
3. ✅ Gaps grouped by category, no remediation proposed.
4. ✅ Call graph (frontend → function → RPC → table).

**Not included (out of scope, per authorization):** scores, rankings, PRs,
hotfixes, standardization, refactors, instrumentation, or any code change
in the functions themselves. Reliability Score remains **blocked** and must
not be produced from this data until R2 is authorized.
