
# Fase 6: Consolidação Final de Edge Functions

## Estado Atual: 80 standalone + 3 gateways = 83 total
## Meta: < 60 standalone (eliminar ~20+ funções)

---

## Análise por Padrão de Auth

| Auth Pattern | Qtd | Pode Consolidar? |
|---|---|---|
| serveAgent (HMAC/token) | 21 | ❌ Auth incompatível com gateway |
| Deno.serve (custom) | 8 | ❌ Webhooks, SAML, SCIM — auth especial |
| servePublic (API-key) | 3 | ❌ api-tenant-* já proxied |
| servePublic (standalone) | 9 | ⚠️ Maioria complexa, já excluída na Fase 5 |
| serveTenant (já no gateway) | 14 | ✅ Proxy → inline quando < 150 linhas |
| serveTenant (fora do gateway) | 12 | ✅ Adicionar ao api-gateway |
| serveInternal (fora do gateway) | 5 | ✅ Adicionar ao ops-gateway |
| serveInternal (já no gateway) | 5 | ✅ Proxy → inline |

---

## Fase 6A: Adicionar funções serveTenant ao api-gateway (12 funções)

Adicionar como **proxy** primeiro (sem inline, pois são grandes/complexas com IA):

| # | Função | Linhas | Namespace:Action |
|---|---|---|---|
| 1 | `action-center-feed` | ~100 | `agent:action-center-feed` |
| 2 | `ai-action-executor` | ~100 | `agent:ai-action-executor` |
| 3 | `ai-agent-assist` | ~100 | `agent:ai-agent-assist` |
| 4 | `ai-analyze-agent` | 253 | `agent:ai-analyze-agent` |
| 5 | `ai-full-audit` | 247 | `agent:ai-full-audit` |
| 6 | `ai-quality-check` | ~90 | `agent:ai-quality-check` |
| 7 | `ai-red-team-assessment` | ~100 | `agent:ai-red-team-assessment` |
| 8 | `ai-router` | 144 | `agent:ai-router` |
| 9 | `ai-system-audit` | ~100 | `agent:ai-system-audit` |
| 10 | `calculate-compliance` | 171 | `security:calculate-compliance` |
| 11 | `export-evidence-bundle` | 172 | `security:export-evidence-bundle` |
| 12 | `fido2-register` | 189 | `security:fido2-register` |

**Ação**: Adicionar ao `ACTION_TO_FUNCTION` do api-gateway + migrar frontend para `callGateway()`.
**Impacto**: 0 funções deletadas (continuam standalone, mas roteadas pelo gateway).

---

## Fase 6B: Adicionar funções serveInternal ao ops-gateway (3 funções)

| # | Função | Linhas | Namespace:Action |
|---|---|---|---|
| 1 | `ai-insight-dispatcher` | ~120 | `sync:ai-insight-dispatcher` |
| 2 | `ai-predict-agent-failure` | ~100 | `check:ai-predict-agent-failure` |
| 3 | `ai-system-analyzer` | 144 | `check:ai-system-analyzer` |

**Ação**: Adicionar ao `ACTION_TO_FUNCTION` do ops-gateway.

---

## Fase 6C: Inline de proxies existentes (api-gateway) — eliminar ~8 funções

Converter proxies do api-gateway em handlers inlined (funções < 200 linhas):

| # | Proxy Atual | Linhas | Handler |
|---|---|---|---|
| 1 | `auto-generate-enrollment` | ~100 | `handlers/build-enrollment.ts` |
| 2 | `get-agent-script-content` | 145 | `handlers/agent-scripts.ts` |
| 3 | `create-reinstall-jobs` | ~90 | `handlers/agent-reinstall.ts` |
| 4 | `setup-agent-script` | ~80 | Merge em `agent-scripts.ts` |
| 5 | `validate-build-pipeline` | ~80 | `handlers/build-validate.ts` |
| 6 | `scan-vulnerabilities` | ~100 | `handlers/security-scan.ts` |
| 7 | `promote-agent-v5` | 138 | `handlers/agent-ops.ts` (existente) |
| 8 | `upload-release-content` | ~90 | Merge em `build-ops.ts` |

**Impacto**: -8 standalone → **72 funções**

---

## Fase 6D: Inline de proxies existentes (ops-gateway) — eliminar ~5 funções

| # | Proxy Atual | Linhas | Handler |
|---|---|---|---|
| 1 | `evaluate-playbook-triggers` | ~110 | `handlers/playbook-core.ts` |
| 2 | `evaluate-automation-rules` | ~120 | `handlers/playbook-automation.ts` |
| 3 | `auto-remediate` | 311 | ⚠️ Grande demais, manter proxy |
| 4 | `autonomous-safe-mode` | 126 | `handlers/playbook-automation.ts` |
| 5 | `execute-playbook-action` | 318 | ⚠️ Grande demais, manter proxy |

**Impacto**: -3 standalone (excluindo as >200 linhas) → **69 funções**

---

## Fase 6E: Migrar frontend para callGateway()

Corrigir chamadas diretas `supabase.functions.invoke()` no frontend:

| Arquivo | Chamada Atual | Migrar Para |
|---|---|---|
| `useActionCenter.ts` | `action-center-feed` | `callGateway('agent', 'action-center-feed')` |
| `useAiActionApproval.ts` | `ai-router` | `callGateway('agent', 'ai-router')` |
| `useAutoRemediation.ts` | `auto-remediate` | `callGateway('agent', 'auto-remediate')` *(proxy)* |
| `useEvidenceBundle.ts` | `export-evidence-bundle` | `callGateway('security', 'export-evidence-bundle')` |
| `usePlaybooks.ts` | `execute-playbook-action` | `callGateway('playbook', 'execute-playbook-action')` *(proxy)* |
| `usePlaybooks.ts` | `evaluate-playbook-triggers` | `callGateway('playbook', 'evaluate-playbook-triggers')` |
| `useAgentSnapshot.ts` | `agent-snapshot` | `callGateway('agent', 'agent-snapshot')` *(já inlined)* |
| `useAgentActions.ts` | `autonomous-safe-mode` | `callGateway('playbook', 'autonomous-safe-mode')` |
| Outros ~10 arquivos | Diretos | `callGateway()` |

---

## Fase 6F: Inline de serveTenant simples (< 100 linhas) — eliminar ~4 funções

Funções AI pequenas que podem ser inlined:

| # | Função | Ação |
|---|---|---|
| 1 | `ai-quality-check` | Inline em `handlers/ai-ops.ts` |
| 2 | `ai-agent-assist` | Inline em `handlers/ai-ops.ts` |
| 3 | `ai-action-executor` | Inline em `handlers/ai-ops.ts` |
| 4 | `ai-system-audit` | Inline em `handlers/ai-ops.ts` |

**Impacto**: -4 standalone → **65 funções**

---

## Resumo do Impacto

| Fase | Ação | Funções Eliminadas |
|---|---|---|
| 6A | Proxy serveTenant no api-gateway | 0 (preparação) |
| 6B | Proxy serveInternal no ops-gateway | 0 (preparação) |
| 6C | Inline proxies api-gateway | -8 |
| 6D | Inline proxies ops-gateway | -3 |
| 6E | Migrar frontend para callGateway | 0 (qualidade) |
| 6F | Inline AI simples | -4 |
| **Total** | | **-15 → 65 funções** |

---

## Funções que DEVEM permanecer standalone (≥ 50)

### serveAgent (21) — Auth HMAC incompatível
`ack-job`, `check-agent-updates`, `collect-router`, `confirm-force-update`, `diagnostics-agent-logs`, `get-agent-config`, `get-agent-policy`, `get-blocked-websites`, `list-reports`, `post-installation-telemetry`, `scan-virus`, `serve-agent-update`, `serve-dns-filter`, `submit-antivirus-status`, `submit-rollback-event`, `submit-router`, `submit-software-inventory`, `submit-system-metrics`, `submit-vuln-findings`, `submit-web-activity`, `update-baseline`, `upload-report`

### Deno.serve custom (8) — Auth especial
`enroll-agent`, `heartbeat`, `poll-jobs`, `register-agent-key`, `saml-sso`, `scim-provisioning`, `stripe-webhook`, `submit-job-result`, `submit-processes`

### servePublic complexas (9+3)
`fido2-authenticate`, `get-diagnostic-script`, `get-latest-agent-script`, `get-reinstall-by-name`, `track-installation-event`, `validate-hmac-signature`, `validate-invite`, `verify-compliance-report`, `verify-document`, `serve-installer`, `api-tenant-features/info/stats`

### Grandes demais para inline (> 200 linhas)
`auto-remediate` (311), `execute-playbook-action` (318), `build-agent-exe` (340), `generate-deploy-package` (250), `generate-portable-installer` (355), `force-reinstall-fleet` (216), `ai-full-audit` (247), `ai-analyze-agent` (253), `ai-red-team-assessment`, `sign-release` (188), `fido2-register` (189)

---

## Ordem de Execução

1. **6A + 6B** — Adicionar proxy maps (quick win, sem risco)
2. **6E** — Migrar frontend para callGateway (padronização)
3. **6C** — Inline proxies api-gateway (elimina 8 standalone)
4. **6D** — Inline proxies ops-gateway (elimina 3 standalone)
5. **6F** — Inline AI simples (elimina 4 standalone)
6. **Validação Final** — `npx tsc --noEmit`, deploy, curl tests

## Validação em Cada Step
- ✅ Zero erros TypeScript
- ✅ Deploy dos gateways
- ✅ Curl test das actions migradas
- ✅ Frontend calls funcionando
