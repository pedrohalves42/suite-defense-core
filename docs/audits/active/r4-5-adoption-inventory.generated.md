# R4.5 — Reliability Adoption Inventory (generated)

Generated: 2026-07-07T23:36:18.264Z
Total edge functions scanned: 74

> Static scan. Measures OPT-IN adoption of R4 primitives per wrapper.
> The wrappers themselves route through `composePipeline` since R4 Wave 1,
> so this report does NOT measure runtime wiring — only per-function opt-in.

## Rollup by wrapper

| Wrapper | Functions | Retry | Breaker | Timeout | Idempotency | Status |
| --- | ---: | ---: | ---: | ---: | ---: | --- |
| none | 3 | 0 | 0 | 0 | 0 | None |
| serveAgent | 21 | 1 | 0 | 0 | 0 | Partial |
| serveHoneypot | 1 | 0 | 0 | 0 | 0 | None |
| serveInternal | 9 | 0 | 0 | 0 | 0 | None |
| servePublic | 15 | 0 | 0 | 0 | 0 | None |
| serveTenant | 25 | 1 | 0 | 25 | 0 | Partial |

## Per-function detail

| Function | Wrapper | Retry | Breaker | Timeout | Idempotency |
| --- | --- | :-: | :-: | :-: | :-: |
| ack-job | serveAgent | · | · | · | · |
| action-center-feed | serveTenant | · | · | ✅ | · |
| ai-action-executor | serveTenant | · | · | ✅ | · |
| ai-agent-assist | serveTenant | · | · | ✅ | · |
| ai-analyze-agent | serveTenant | · | · | ✅ | · |
| ai-full-audit | serveTenant | · | · | ✅ | · |
| ai-insight-dispatcher | serveInternal | · | · | · | · |
| ai-predict-agent-failure | serveInternal | · | · | · | · |
| ai-quality-check | serveTenant | · | · | ✅ | · |
| ai-red-team-assessment | serveTenant | · | · | ✅ | · |
| ai-router | serveTenant | · | · | ✅ | · |
| ai-system-analyzer | serveInternal | · | · | · | · |
| ai-system-audit | serveTenant | · | · | ✅ | · |
| api-gateway | servePublic | · | · | · | · |
| auto-generate-enrollment | serveTenant | · | · | ✅ | · |
| auto-remediate | serveTenant | · | · | ✅ | · |
| autonomous-safe-mode | serveInternal | · | · | · | · |
| build-agent-exe | serveTenant | · | · | ✅ | · |
| check-agent-updates | serveAgent | · | · | · | · |
| check-subscription | none | · | · | · | · |
| check-tenant-abuse | serveInternal | · | · | · | · |
| cleanup-router | servePublic | · | · | · | · |
| collect-router | serveAgent | · | · | · | · |
| confirm-force-update | serveAgent | · | · | · | · |
| create-checkout | none | · | · | · | · |
| create-reinstall-jobs | serveTenant | · | · | ✅ | · |
| diagnostics-agent-logs | serveAgent | · | · | · | · |
| enroll-agent | servePublic | · | · | · | · |
| evaluate-automation-rules | serveInternal | · | · | · | · |
| evaluate-playbook-triggers | serveInternal | · | · | · | · |
| execute-playbook-action | serveTenant | · | · | ✅ | · |
| fido2-register | serveTenant | · | · | ✅ | · |
| force-reinstall-fleet | serveTenant | · | · | ✅ | · |
| generate-deploy-package | serveTenant | · | · | ✅ | · |
| generate-portable-installer | serveTenant | · | · | ✅ | · |
| get-agent-config | serveAgent | · | · | · | · |
| get-agent-policy | serveAgent | · | · | · | · |
| get-agent-script-content | serveTenant | · | · | ✅ | · |
| get-blocked-websites | serveAgent | · | · | · | · |
| get-diagnostic-script | servePublic | · | · | · | · |
| get-latest-agent-script | servePublic | · | · | · | · |
| heartbeat | serveAgent | · | · | · | · |
| honeypot-handler | serveHoneypot | · | · | · | · |
| list-reports | serveAgent | · | · | · | · |
| ops-checks | servePublic | · | · | · | · |
| ops-gateway | servePublic | · | · | · | · |
| ops-playbook | servePublic | · | · | · | · |
| ops-reports | servePublic | · | · | · | · |
| ops-sync | servePublic | · | · | · | · |
| poll-jobs | serveAgent | · | · | · | · |
| post-installation-telemetry | serveAgent | · | · | · | · |
| promote-agent-v5 | serveTenant | · | · | ✅ | · |
| public-gateway | servePublic | · | · | · | · |
| register-agent-key | serveAgent | · | · | · | · |
| register-agent-release | serveTenant | · | · | ✅ | · |
| run-rls-tests | none | · | · | · | · |
| saml-sso | servePublic | · | · | · | · |
| scan-virus | serveAgent | ✅ | · | · | · |
| scan-vulnerabilities | serveTenant | · | · | ✅ | · |
| scim-provisioning | servePublic | · | · | · | · |
| serve-agent-update | serveAgent | · | · | · | · |
| serve-dns-filter | serveAgent | · | · | · | · |
| serve-installer | servePublic | · | · | · | · |
| setup-agent-script | serveInternal | · | · | · | · |
| sign-release | serveTenant | · | · | ✅ | · |
| soc2-evidence-collector | serveTenant | · | · | ✅ | · |
| stripe-webhook | servePublic | · | · | · | · |
| submit-hmac-router | serveAgent | · | · | · | · |
| submit-job-result | serveAgent | · | · | · | · |
| submit-router | serveAgent | · | · | · | · |
| update-baseline | serveAgent | · | · | · | · |
| upload-release-content | serveInternal | · | · | · | · |
| upload-report | serveAgent | · | · | · | · |
| validate-build-pipeline | serveTenant | ✅ | · | ✅ | · |
