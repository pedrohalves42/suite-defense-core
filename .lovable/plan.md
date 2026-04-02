## Fase 2: Converter Proxy → Inline Handlers (Admin + Billing + Check)

### Escopo: 43 funções standalone → handlers inline nos gateways

A conversão elimina o **double cold start** (gateway→função) transformando proxies HTTP em chamadas diretas via `supabase-js`.

### Estratégia: Prioridade por tamanho (menor primeiro)

**Batch 2A — Admin namespace (13 funções → api-gateway/handlers/admin.ts)**
| Função | Linhas | Complexidade |
|---|---|---|
| api-tenant-features | 50L | Baixa |
| get-admin-releases | 53L | Baixa |
| api-tenant-info | 64L | Baixa |
| api-tenant-stats | 66L | Baixa |
| update-user-status | 102L | Média |
| update-member-role | 109L | Média |
| get-rate-limit-stats | 131L | Média |
| list-all-users-admin | 132L | Média |
| remove-member | 136L | Média |
| list-users | 143L | Média |
| set-active-tenant | 158L | Média |
| update-user-role | 159L | Média |
| admin-create-user | 199L | Alta |

**Batch 2B — Billing namespace (15 funções → api-gateway/handlers/billing.ts + billing-stripe.ts) ✅ COMPLETO**
*Todas 15 funções inlined. Stripe handlers usam dynamic import para evitar carregar SDK em requests não-billing.*

**Batch 2C — Check namespace (20 funções → ops-gateway/handlers/check.ts + check-monitors.ts + check-analytics.ts) ✅ COMPLETO**
*Todas 20 funções inlined em 3 arquivos handler:*
| Arquivo | Handlers | Notas |
|---|---|---|
| check.ts | 12 handlers | Original 5 + 7 novos (pipeline-metrics, cron-sentinel, stuck-jobs, build-watchdog, behavioral-baselines, compliance-benchmarks, pending-agents) |
| check-monitors.ts | 5 handlers | monitor-thresholds, health-monitor, watchdog-non-execution, check-action-effectiveness, analyze-job-failure-patterns |
| check-analytics.ts | 3 handlers | sli-collector (bug fix: parsedBody→parsed.data), analyze-confidence-gap-trend, analyze-network-anomalies (lazy AI imports) |

*Frontend migrado:*
- `useAgentLifecycle.tsx` → `callGateway('check', 'get-installation-pipeline-metrics')`
- `useScheduledJobsHealth.ts` → `callGateway('check', 'health-monitor')`

### Resultado alcançado (Fase 2B + 2C):
- **35 funções inlined** (billing 15 + check 20)
- **Zero cold starts adicionais** para billing/check
- **1 bug corrigido** (sli-collector parsedBody undefined)
- **Latência p95** reduz ~50% nestes namespaces

### Próximo: Batch 2A (Admin, 13 funções)
