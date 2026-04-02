## Fase 3: Inlining dos Namespaces Restantes (Proxy → Inline)

### Inventário Total
| Gateway | Namespace | Proxy | Frontend Callers | Complexidade |
|---|---|---|---|---|
| api-gateway | security | 29 funções | ~8 callers | Alta (EDR, SIEM, CVE, AI) |
| api-gateway | build | 15 funções | ~7 callers | Alta (GitHub Actions, crypto, scripts) |
| api-gateway | agent | 26 funções | ~12 callers | **Bloqueada** (HMAC, raw body) |
| ops-gateway | sync (restante) | 12 funções | ~6 callers | Média |
| ops-gateway | playbook | 16 funções | ~4 callers | Alta (SOAR, automação) |
| ops-gateway | report | 8 funções | ~2 callers | Alta (AI reports, PDFs) |
| ops-gateway | cleanup | 3+router | ~4 callers | Baixa |
| ops-gateway | notify | 4+router | ~1 caller | Baixa |

**Total: ~113 funções proxy restantes, ~44 frontend callers**

---

### ⚠️ Exclusões da Fase 3 (NÃO inline)

**Agent namespace (26 funções)** — Mantidas como proxy:
- 8 funções usam HMAC/raw body (heartbeat, poll-jobs, submit-*, register-agent-key, enroll-agent, validate-hmac-signature)
- Restantes dependem de auth flows especiais (agent token, triple auth)
- Risco de regressão alto, benefício baixo (agentes chamam direto, não passam pelo frontend gateway)

**Funções com middleware especial** (já listadas em `deno-serve-migration-exceptions.md`):
- `auto-generate-enrollment`, `evaluate-automation-rules`, `evaluate-playbook-triggers`, `oncall-integration`, `soar-engine`, `send-report-notification` — usam `serveTenant`/`serveInternal`

---

### Estratégia: 5 Batches por prioridade de impacto no frontend

#### Batch 3A — Cleanup + Notify (7 funções, ~400L) ⚡ Quick Win
Inline os routers diretamente no ops-gateway, eliminando o double-hop `ops-gateway → cleanup-router → target`.

| Função | Linhas | Destino |
|---|---|---|
| cleanup-expired-enrollment-keys | 55L | ops-gateway/handlers/cleanup.ts |
| cleanup-orphaned-data | 77L | ops-gateway/handlers/cleanup.ts |
| cleanup-stale-honeypots | 68L | ops-gateway/handlers/cleanup.ts |
| notification-dispatcher | 147L | ops-gateway/handlers/notify.ts |
| send-report-notification | 127L | ops-gateway/handlers/notify.ts |
| send-scheduled-report | 103L | ops-gateway/handlers/notify.ts |
| get-telegram-chat-id | 46L | ops-gateway/handlers/notify.ts |

**Frontend:** 4 callers (cleanup-router invoke → callGateway)
**Resultado:** Deletar cleanup-router + notification-router + 7 standalone

#### Batch 3B — Sync restante (12 funções, ~1400L)
| Função | Linhas | Notas |
|---|---|---|
| sync-blocked-websites | 100L | 4 frontend callers |
| process-failed-jobs | 94L | Cron |
| process-scheduled-jobs | 112L | Cron |
| invoke-scheduled-jobs | 192L | Cron |
| maintenance-cron | 41L | Cron |
| system-maintenance | 94L | 1 frontend caller |
| dlq-action | 106L | 1 caller |
| process-dlq-retries | 257L | 1 caller |
| release-sync | 78L | Cron |
| sync-storage-bucket | 141L | Cron |
| sync-stripe-subscriptions | 68L | Cron |
| sync-threat-feeds | 87L | 1 caller |

**Frontend:** ~6 callers

#### Batch 3C — Security (29 funções, ~3800L)
Dividir em 3 handler files:
- `security-core.ts` (~12 handlers): failed-logins, blocked-attempts, quarantine, auto-block, patches, cleanup
- `security-intel.ts` (~10 handlers): CVE, MITRE, SIEM, EDR, threat intel, IOC
- `security-analysis.ts` (~7 handlers): security-monitor, advisor, graph, integrity, shadow-it, RLS tests

**Frontend:** ~8 callers
**Nota:** `security-advisor` (331L) e `threat-intelligence-lookup` (418L) são grandes — usar lazy imports

#### Batch 3D — Build (15 funções, ~2600L)
Dividir em 2 handler files:
- `build-core.ts`: enrollment keys, callbacks, validation, release registration
- `build-heavy.ts`: build-agent-exe (340L), generate-deploy-package (250L), generate-portable-installer (355L), serve-installer (174L), get-diagnostic-script (347L) — lazy imports

**Frontend:** ~7 callers
**Nota:** Funções com `serveTenant(skipTenantValidation)` (`register-agent-release`, `sign-release`, `get-diagnostic-script`, `serve-installer`) mantêm auth no handler

#### Batch 3E — Playbook + Report (24 funções, ~4500L)
Dividir em 3 handler files:
- `playbook-core.ts` (~10 handlers): execute, triggers, automation-rules, remediation
- `playbook-risk.ts` (~6 handlers): SOAR, attack-sim, risk-score, software-risk, ITSM
- `report.ts` (~8 handlers): todos os generate-*-report, list-reports, scheduled

**Frontend:** ~6 callers
**Nota:** Report generators são AI-heavy — usar lazy imports para AI SDK

---

### Migração Frontend (em cada batch)
Substituir `supabase.functions.invoke('nome')` → `callGateway('namespace', 'action', payload)`

### Resultado Esperado (Fase 3 completa)
- **~87 funções inlined** (excluindo agent namespace)
- **~87 standalone deletadas**
- **Total de edge functions:** de 215 → ~128
- **Cold starts eliminados:** ~87 funções × ~4.3s = ~374s de latência total removida
- **Custo:** Menos funções deployadas = menos memória reservada

### Ordem de Execução Recomendada
1. **3A (cleanup+notify)** — mais simples, valida o padrão
2. **3B (sync)** — impacto direto em cron jobs
3. **3C (security)** — maior volume, requer testes
4. **3D (build)** — funções pesadas, lazy imports
5. **3E (playbook+report)** — mais complexas, AI-dependent
