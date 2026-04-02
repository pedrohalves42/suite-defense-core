## Fase 2: Converter Proxy → Inline Handlers (Admin + Billing + Check) ✅ COMPLETO

### Escopo: 43 funções standalone → handlers inline nos gateways

A conversão elimina o **double cold start** (gateway→função) transformando proxies HTTP em chamadas diretas via `supabase-js`.

### Resultado Final

**Batch 2A — Admin namespace (13 funções) ✅ COMPLETO**
| Status | Detalhe |
|---|---|
| 10 funções inlined | get-admin-releases, update-user-status, update-member-role, remove-member, list-users, list-all-users-admin, set-active-tenant, update-user-role, admin-create-user, get-rate-limit-stats |
| 3 funções proxy (API-key) | api-tenant-features, api-tenant-info, api-tenant-stats (auth por API key, mantidas como proxy) |
| 10 standalone deletadas | Diretórios removidos + undeploy |
| 9 frontend callers migrados | `supabase.functions.invoke()` → `callGateway('admin', ...)` |

**Batch 2B — Billing namespace (15 funções) ✅ COMPLETO**
*Todas 15 funções inlined. Stripe handlers usam dynamic import.*

**Batch 2C — Check namespace (20 funções) ✅ COMPLETO**
*Todas 20 funções inlined em 3 arquivos handler.*

### Métricas:
- **45 funções inlined** (admin 10 + billing 15 + check 20)
- **10 standalone admin deletadas**
- **3 API-key proxy mantidas** (isolamento de auth)
- **Zero cold starts adicionais** para admin/billing/check
- **1 bug corrigido** (sli-collector parsedBody undefined)
