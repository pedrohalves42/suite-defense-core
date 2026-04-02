## Fase 1 — Remoção dos Proxy Routers Deprecated

### Passo 1: Criar `src/lib/gateway.ts` helper
Utilitário centralizado para chamadas aos gateways.

### Passo 2: Migrar 6 chamadas `ops-router` no frontend → `ops-gateway`
| Arquivo | Ação Atual | Nova Ação (ops-gateway) |
|---|---|---|
| useAutomationRules.ts | `automation:evaluate` | `playbook:evaluate-automation-rules` |
| Signup.tsx | `notify:welcome` | `notify:welcome` |
| useNotificationSettings.ts (L203) | `notify:dispatch` | `notify:dispatch` |
| useNotificationSettings.ts (L298) | `notify:scheduled-report` | `notify:scheduled-report` |
| AlertsTab.tsx | `notify:dispatch` | `notify:dispatch` |
| TenantInvites.tsx | `notify:invite` | `notify:invite` |

### Passo 3: Deletar 6 funções deprecated
- `admin-router/` (proxy puro → api-gateway)
- `agent-mgmt-router/` (proxy puro → api-gateway)
- `build-router/` (proxy puro → api-gateway)
- `playbook-router/` (proxy puro → ops-gateway)
- `report-router/` (proxy puro → ops-gateway)
- `ops-router/` (meta-router → gateways diretos)

### Passo 4: Atualizar CI e docs
- Remover referências no `ci/validate-middleware.sh`
- Atualizar `docs/deno-serve-migration-exceptions.md`

### Passo 5: Validar
- Busca em todo o codebase confirma zero referências
- Build passa sem erros
