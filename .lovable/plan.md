
## Fase 2C — Inline Check Namespace (15 funções → ops-gateway/handlers/check.ts)

### Estado Atual
- **5 já inlined** em `check.ts`: `check-task-sla-breach`, `evaluate-job-slo`, `check-installation-health`, `check-production-health`, `detect-stuck-installations`
- **15 restantes** no proxy map `ACTION_TO_FUNCTION` que fazem double cold-start (gateway→função)

### Estratégia: 3 Sub-batches por complexidade e dependências

**Sub-batch 2C-1 — Simples (só DB, sem deps externas) — 7 funções**

| Função | Linhas | Notas |
|---|---|---|
| `get-installation-pipeline-metrics` | 62L | ⚠ Usa `serveTenant` (precisa `tenantId` do payload) |
| `cron-sentinel` | 62L | Puro DB + task creation |
| `check-stuck-jobs` | 103L | Adaptive zombie thresholds |
| `build-watchdog` | 91L | ⚠ Usa `BUILD_GH_TOKEN` + GitHub API |
| `calculate-behavioral-baselines` | 85L | Stats em agent_processes |
| `compute-compliance-benchmarks` | 82L | Score calculation |
| `check-pending-agents` | 86L | ⚠ Usa Resend SDK (lazy import) |

**Sub-batch 2C-2 — Médios (lógica complexa, sem AI) — 5 funções**

| Função | Linhas | Notas |
|---|---|---|
| `monitor-thresholds` | 84L | Chama `notification-dispatcher` |
| `health-monitor` | 128L | Promise.allSettled, 7 checks paralelos |
| `watchdog-non-execution` | 106L | ⚠ Importa `business-hours.ts` |
| `check-action-effectiveness` | 145L | 6 verification strategies |
| `analyze-job-failure-patterns` | 182L | ⚠ Usa `serveTenant` (precisa tenantId) |

**Sub-batch 2C-3 — Pesados (AI/complexo) — 3 funções**

| Função | Linhas | Notas |
|---|---|---|
| `sli-collector` | 114L | ⚠ Bug existente: `parsedBody` undefined nas actions `sli`/`slo`/`dashboard` (linhas 61,87,108) — corrigir para `parsed.data` |
| `analyze-confidence-gap-trend` | 150L | Per-tenant loop |
| `analyze-network-anomalies` | 176L | ⚠ Usa AI provider (lazy import) |

### Processo para cada sub-batch

1. **Extrair lógica core** — Remover wrappers `serveInternal`/`serveTenant`, adaptar para signature `(supabase, requestId, payload) => Promise<unknown>`
2. **Lazy imports** — Resend, AI-provider, fetchWithTimeout: importar dinamicamente dentro do handler
3. **Fix bugs** — `sli-collector`: corrigir referências `parsedBody` → `parsed.data` 
4. **Adicionar ao `check.ts`** — Split em `check.ts` e `check-heavy.ts` se o arquivo ficar >500L
5. **Mover de `ACTION_TO_FUNCTION` → `INLINED_HANDLERS`** no index.ts
6. **Migrar chamadores frontend** — `useAgentLifecycle.tsx` e `useScheduledJobsHealth.ts` para usar `callGateway()`

### Chamadores a migrar

| Arquivo | Função chamada | Migrar para |
|---|---|---|
| `src/hooks/useAgentLifecycle.tsx` | `invoke('get-installation-pipeline-metrics')` | `callGateway('check', 'get-installation-pipeline-metrics')` |
| `src/hooks/useScheduledJobsHealth.ts` | `invoke('health-monitor')` | `callGateway('check', 'health-monitor')` |

### Validação

1. Deploy ops-gateway
2. Curl test para cada ação inlined (`check:check-stuck-jobs`, etc.)
3. Verificar que `sli-collector` não tem mais o bug `parsedBody`
4. Build frontend (0 erros TypeScript)
5. Standalone functions mantidas 14 dias como fallback

### Resultado esperado
- **15 proxies eliminados** → zero double cold-starts no namespace check
- **1 bug corrigido** (sli-collector parsedBody)
- **~500L** de handlers adicionados ao ops-gateway
- **Latência p95** reduz ~50% para operações check
