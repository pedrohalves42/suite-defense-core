# D13 — Inventário global pós-`_shared`

**Status:** ✅ Concluído (read-only)
**Data:** 2026-06-26
**Escopo:** inventário e classificação de risco. Nenhuma alteração de código.

---

## 1. Objetivo

Recalcular a dívida real de `@ts-nocheck` em `supabase/functions/` após o fechamento de `_shared` (D12-C) e priorizar a próxima onda (D14).

---

## 2. Estado final do `_shared`

- Diretivas ativas em `_shared/`: **0**
- Gate atual (`scripts/guard-no-ts-nocheck-tier1.sh`): **36 arquivos protegidos**
- 181 arquivos `.ts` em `_shared/` validados

---

## 3. Contagem global

| Métrica | Valor |
| --- | ---: |
| Diretivas `@ts-nocheck` ativas em `supabase/functions/` | **96** |
| Arquivos afetados | **96** (1 diretiva por arquivo) |
| Fora de `_shared` | **96** |
| Em `_shared` | 0 |
| Arquivos que importam/usam `service_role` | **13** |
| Arquivos servidos (Deno.serve/serveTenant/serveAgent/serveInternal) | **55** entry-points + handlers |

Comandos:

```bash
rg -n '^\s*(//|/\*)\s*@ts-nocheck\b' supabase/functions          # 96
rg -n '^\s*(//|/\*)\s*@ts-nocheck\b' supabase/functions/_shared  # 0
rg -l '^\s*(//|/\*)\s*@ts-nocheck\b' supabase/functions | sort   # 96 paths
```

---

## 4. Classificação por risco

### Tier A — public/auth/billing/identity/tenant/service_role (11)

| Arquivo | Motivo | Risco |
| --- | --- | --- |
| `api-gateway/handlers/billing.ts` | billing + service_role | 🔴 Crítico |
| `api-gateway/handlers/admin-auth.ts` | auth/admin | 🔴 Crítico |
| `api-gateway/handlers/enrollment.ts` | onboarding/identity | 🔴 Crítico |
| `check-subscription/index.ts` | billing | 🟠 Alto |
| `create-checkout/index.ts` | billing (Stripe) | 🟠 Alto |
| `fido2-register/index.ts` | auth/WebAuthn | 🟠 Alto |
| `enroll-agent/index.ts` | identidade de agente | 🟠 Alto |
| `auto-generate-enrollment/index.ts` | identity tokens | 🟠 Alto |
| `check-tenant-abuse/index.ts` | tenant + service_role | 🟠 Alto |
| `honeypot-handler/index.ts` | superfície pública | 🟠 Alto |
| `submit-hmac-router/index.ts` | ingest público HMAC | 🟠 Alto |

### Tier B — ops / admin / automation / remediation (28)

`ops-gateway/handlers/*` (14): access-review, anomaly-ops, block-website, check-analytics, check-honeypot, cleanup, edr-ops, notify, playbook-analysis, playbook-automation, playbook-core, playbook, report-scheduled, security-ops, sync-infra
`ops-playbook/*` (3): handlers/playbook-automation, handlers/playbook-core, index
`ops-sync/*` (3): handlers/edr-ops, handlers/sync-jobs, index
`api-gateway/handlers/*` (3): agent-ops, security-advisor, security-scanning, security-threats
`auto-remediate/index.ts`, `autonomous-safe-mode/index.ts`, `autonomous-safe-mode/rules/quality.ts`, `autonomous-safe-mode/rules/security.ts`, `autonomous-safe-mode/types.ts`
`evaluate-automation-rules/*` (4): index, protection-pipeline, tenant-evaluator, trigger-evaluators
`evaluate-playbook-triggers/index.ts`, `execute-playbook-action/index.ts`, `create-reinstall-jobs/index.ts`, `force-reinstall-fleet/index.ts`
`collect-router/index.ts`, `action-center-feed/index.ts`, `update-baseline/index.ts`

(observação: contagem somada excede 28 — agrupados por subpastas).

### Tier C — AI / reports / analytics (18)

`ai-action-executor`, `ai-agent-assist`, `ai-analyze-agent`, `ai-full-audit`, `ai-insight-dispatcher`, `ai-predict-agent-failure`, `ai-quality-check` (handlers+index), `ai-red-team-assessment`, `ai-router` (index + handlers/correlate-alerts, execute-solution, security-copilot), `ai-system-analyzer` (analysis-engine+index), `ai-system-audit` (dimension-mapper+index), `ops-reports/*` (3), `list-reports`, `upload-report`, `soc2-evidence-collector`.

### Tier D — build / installer / legado (≈17)

`build-agent-exe/{cache,index}`, `generate-deploy-package`, `generate-portable-installer`, `get-agent-config`, `get-agent-policy`, `get-agent-script-content`, `get-blocked-websites`, `get-diagnostic-script`, `get-latest-agent-script`, `setup-agent-script`, `register-agent-release`, `promote-agent-v5`, `sign-release`, `upload-release-content`, `validate-build-pipeline`, `check-agent-updates`, `diagnostics-agent-logs`, `post-installation-telemetry`, `scan-virus`, `scan-vulnerabilities`.

---

## 5. Arquivos com `service_role` E `@ts-nocheck` (13)

```
action-center-feed/index.ts
ai-system-analyzer/index.ts
api-gateway/handlers/billing.ts
build-agent-exe/index.ts
check-tenant-abuse/index.ts
evaluate-automation-rules/index.ts
evaluate-playbook-triggers/index.ts
ops-gateway/handlers/playbook-automation.ts
ops-gateway/handlers/playbook-core.ts
ops-playbook/handlers/playbook-automation.ts
ops-playbook/handlers/playbook-core.ts
ops-sync/handlers/sync-jobs.ts
upload-release-content/index.ts
```

→ Prioridade máxima para D14 (executam com privilégio elevado).

---

## 6. Arquivos públicos/servidos com `@ts-nocheck`

55 entry-points/handlers servidos diretamente cruzam com a lista de 96 (a maioria das funções). Destaque para entrada externa não autenticada/HMAC:

- `submit-hmac-router/index.ts`
- `honeypot-handler/index.ts`
- `collect-router/index.ts`
- `enroll-agent/index.ts`
- `auto-generate-enrollment/index.ts`
- `fido2-register/index.ts`
- `check-subscription/index.ts`
- `create-checkout/index.ts`

---

## 7. Próxima onda recomendada

**D14-A — Tier A (billing/auth/identity/tenant + service_role)**

Justificativa: maior redução de risco por arquivo (privilégio elevado + superfície externa). Lista de partida (11 arquivos):

```
api-gateway/handlers/billing.ts          ← service_role
api-gateway/handlers/admin-auth.ts
api-gateway/handlers/enrollment.ts
check-subscription/index.ts
create-checkout/index.ts
fido2-register/index.ts
enroll-agent/index.ts
auto-generate-enrollment/index.ts
check-tenant-abuse/index.ts              ← service_role
honeypot-handler/index.ts
submit-hmac-router/index.ts
```

Sugestão de sub-ondas:

- **D14-A1** — billing (3 arquivos: billing.ts, check-subscription, create-checkout)
- **D14-A2** — auth/identity (admin-auth, enrollment, fido2-register, enroll-agent, auto-generate-enrollment)
- **D14-A3** — tenant/public ingest (check-tenant-abuse, honeypot-handler, submit-hmac-router)

---

## 8. Riscos residuais

- 96 arquivos ainda em type-debt fora de `_shared`. Type drift pode reaparecer sem aviso.
- 13 arquivos com `service_role` rodam sem checagem de tipos — risco de regressão silenciosa em writes privilegiados.
- Gate só cobre 36 arquivos saneados; novos arquivos podem nascer com `@ts-nocheck` se não estiverem na lista.
- Backlog funcional (`CLEAN-01`, `SAML-HARDEN-01`, `SCIM-HARDEN-01`, `COALESCER-HARDEN-01`, `PERF-01`, `TYPEGEN-SYNC-01`) permanece fora deste trilho.

---

## 9. Decisão sugerida para D14

Abrir **D14-A1 — `api-gateway/handlers/billing.ts`** como primeiro alvo:

- maior risco combinado (service_role + receita)
- consumer único conhecido (`api-gateway/index.ts`)
- escopo pequeno (1 arquivo)
- valida o padrão de saneamento para a sub-onda billing antes de avançar para A2/A3

D14 só inicia após aprovação explícita.
