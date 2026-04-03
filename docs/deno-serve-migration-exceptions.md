# Deno.serve Migration — Exception Registry

## Migrated to Middleware (15 functions) ✅
| Function | Middleware | Notes |
|---|---|---|
| ai-quality-check | serveTenant | Admin JWT + tenant |
| ai-red-team-assessment | serveTenant | Admin JWT + tenant |
| ai-system-audit | serveTenant | Admin JWT + tenant |
| analyze-job-failure-patterns | serveTenant | Admin JWT + tenant |
| auto-generate-enrollment | serveTenant | Admin JWT + tenant |
| create-custom-trial | serveTenant (skipTenantValidation) | Super admin only |
| evaluate-automation-rules | serveInternal | Cron/service_role |
| evaluate-playbook-triggers | serveInternal | Internal orchestration |
| get-diagnostic-script | servePublic | Public GET, rate-limited |
| oncall-integration | serveInternal | PagerDuty integration |
| promote-agent-v5 | serveTenant (skipTenantValidation) | Super admin / internal |
| register-agent-release | serveTenant (skipTenantValidation) | Super admin only |
| send-report-notification | serveInternal | Cron notification queue |
| sign-release | serveTenant (skipTenantValidation) | Super admin crypto ops |
| soar-engine | serveInternal | Automated security response |

## Justified Exceptions — Routers (6 functions)
> Routers consolidate multiple sub-functions via namespace dispatch. Migrating would break the router architecture pattern.

| Function | Reason |
|---|---|
| billing-router | Domain router — billing/subscription actions |
| check-router | Domain router — health/status checks |
| cleanup-router | Domain router — data cleanup/retention |
| notification-router | Domain router — notification dispatch |
| security-router | Domain router — security operations |
| sync-router | Domain router — data sync operations |

### Removed Proxy Routers (Phase 1 consolidation — 2026-04-02)
> These were thin proxies to api-gateway/ops-gateway and have been removed.
> All their actions are served directly by the gateways.

| Function | Replaced By |
|---|---|
| ~~admin-router~~ | api-gateway `admin:*` |
| ~~agent-mgmt-router~~ | api-gateway `agent:*` |
| ~~build-router~~ | api-gateway `build:*` |
| ~~ops-router~~ | api-gateway / ops-gateway (meta-router) |
| ~~playbook-router~~ | ops-gateway `playbook:*` |
| ~~report-router~~ | ops-gateway `report:*` |

### Inlined Standalone Functions (Phase 1B — 2026-04-03)
> These were standalone functions inlined into gateways for reduced cold starts.

| Function | Replaced By |
|---|---|
| ~~activate-agent-honeypot~~ | api-gateway `security:activate-agent-honeypot` |
| ~~revert-agent-honeypot~~ | api-gateway `security:revert-agent-honeypot` |
| ~~create-honeypot-pool~~ | ops-gateway `sync:create-honeypot-pool` |
| ~~ai-behavioral-anomaly-detector~~ | ops-gateway `check:ai-behavioral-anomaly-detector` |
| ~~block-website~~ | ops-gateway `security:block-website` |

### Inlined Standalone Functions (Phase 1C — 2026-04-03)
> Playbook namespace functions inlined into ops-gateway.

| Function | Replaced By |
|---|---|
| ~~execute-playbook~~ | ops-gateway `playbook:execute-playbook` |
| ~~process-playbook-trigger-logs~~ | ops-gateway `playbook:process-playbook-trigger-logs` |
| ~~rollback-by-decision-event~~ | ops-gateway `playbook:rollback-by-decision-event` |
| ~~rollback-remediation~~ | ops-gateway `playbook:rollback-remediation` |
| ~~resolve-action-policy~~ | ops-gateway `playbook:resolve-action-policy` |
| ~~soar-engine~~ | ops-gateway `playbook:soar-engine` |
| ~~auto-execute-ai-actions~~ | ops-gateway `playbook:auto-execute-ai-actions` |
| ~~oncall-integration~~ | ops-gateway `playbook:oncall-integration` |
| ~~create-itsm-ticket~~ | ops-gateway `playbook:create-itsm-ticket` |
| ~~calculate-risk-score~~ | ops-gateway `playbook:calculate-risk-score` |
| ~~run-attack-simulation~~ | ops-gateway `playbook:run-attack-simulation` |

### Inlined Standalone Functions (Phase 1D — 2026-04-03)
> Report namespace functions inlined into ops-gateway.

| Function | Replaced By |
|---|---|
| ~~generate-compliance-report~~ | ops-gateway `report:compliance` |
| ~~generate-executive-report~~ | ops-gateway `report:executive` |
| ~~generate-explainable-report~~ | ops-gateway `report:explainable` |
| ~~generate-security-report~~ | ops-gateway `report:security` |
| ~~generate-weekly-report~~ | ops-gateway `report:weekly` |
| ~~auto-generate-report~~ | ops-gateway `report:auto` |
| ~~scheduled-report-generator~~ | ops-gateway `report:scheduled` |

## Justified Exceptions — Agent-Facing / HMAC (8 functions)
> These require raw body access for HMAC signature verification or have triple auth flows (agent token + JWT + anonymous).

| Function | Reason |
|---|---|
| heartbeat | HMAC verification needs raw body (`req.text()`) |
| poll-jobs | Agent token + HMAC auth flow |
| submit-job-result | Agent token + HMAC + raw body |
| submit-processes | Agent telemetry with HMAC |
| register-agent-key | Agent key registration with HMAC |
| enroll-agent | Enrollment flow with key validation |
| track-installation-event | Triple auth: agent+HMAC, JWT, anonymous |
| validate-hmac-signature | Core HMAC validation utility |

## Justified Exceptions — Special Purpose (6 functions)
> These have unique requirements incompatible with standard middleware.

| Function | Reason |
|---|---|
| stripe-webhook | Stripe signature verification needs raw body |
| saml-sso | SAML protocol with XML body handling |
| scim-provisioning | SCIM protocol with specific auth model |
| health | Lightweight health check, no auth needed |
| serve-installer | Public static file serving |
| get-reinstall-by-name | Public agent reinstall endpoint |
| post-installation-telemetry | Agent telemetry with flexible auth |

## CI Governance Gates (Automated)
> These scripts run in CI to prevent regressions.

| Gate | File | What it checks |
|---|---|---|
| Middleware compliance | `ci/validate-middleware.sh` | Blocks new raw `Deno.serve()` not in exception list |
| Zod coverage | `ci/validate-zod-coverage.sh` | Blocks functions accepting body without `safeParse` |
| Quality gate | `scripts/ci_quality_gate.py --check-zod` | Blocks >400 lines, console.*, missing Zod on mutations |
