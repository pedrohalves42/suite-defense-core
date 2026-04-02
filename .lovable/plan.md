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

**Batch 2B — Billing namespace (15 funções → api-gateway/handlers/billing.ts)**
*5 já inlined. Restam 10 + send-trial-reminder:*
| Função | Linhas |
|---|---|
| create-stripe-products | 53L |
| list-invoices | 61L |
| customer-portal | 64L |
| create-trial-subscription | 66L |
| create-stripe-products-extended | 83L |
| stripe-health-check | 92L |
| create-custom-trial | 93L |
| unit-economics | 111L |
| create-checkout | 119L |
| revenue-projections | 136L |
| send-trial-reminder | 145L |
| check-subscription | 157L |
| sales-pipeline | 169L |
| subscription-analytics | 196L |
| manage-subscription | 328L |

**Batch 2C — Check namespace (15 funções → ops-gateway/handlers/check.ts)**
*5 já inlined. Restam 10:*
| Função | Linhas |
|---|---|
| get-installation-pipeline-metrics | 62L |
| cron-sentinel | 62L |
| monitor-thresholds | 84L |
| calculate-behavioral-baselines | 85L |
| check-pending-agents | 86L |
| build-watchdog | 91L |
| check-stuck-jobs | 103L |
| sli-collector | 114L |
| check-action-effectiveness | 145L |
| analyze-confidence-gap-trend | 150L |
| analyze-network-anomalies | 176L |
| analyze-job-failure-patterns | 182L |

### Processo para cada batch:
1. Ler cada função standalone
2. Extrair a lógica core (remover middleware wrapper, CORS, etc.)
3. Criar handler inline no arquivo handlers/ do gateway
4. Mover ação de `ACTION_TO_FUNCTION` para `INLINED_HANDLERS`
5. Manter função original por 14 dias como fallback
6. Após validação, deletar função standalone

### Migração do frontend (paralelo):
~30 chamadas diretas `invoke('nome-função')` que já têm mapeamento no gateway serão migradas para usar `callGateway()`.

### ⚠️ Restrição de tamanho
Este é um trabalho de **alta granularidade** com 43 funções. Proponho executar **um batch por vez** para evitar erros. Começar pelo Batch 2A (admin, 13 funções menores)?

### Resultado esperado:
- **43 funções removidas** (226 → 183)
- **Zero cold starts adicionais** para admin/billing/check
- **Latência p95** reduz ~50% nestes namespaces
