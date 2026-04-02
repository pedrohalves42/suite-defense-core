## Batch 2A — Admin Namespace (13 funções → 100% inline)

### Estado Atual
- **10 funções já inlined** em `api-gateway/handlers/admin.ts` (431 linhas) ✅
- **3 funções ainda em proxy** via `API_KEY_PROXY`: `api-tenant-features`, `api-tenant-info`, `api-tenant-stats` (usam auth por API key, não JWT)
- **9 chamadores frontend** ainda usam `supabase.functions.invoke()` direto em vez de `callGateway()`

### Etapas

#### Etapa 1: Migrar Frontend para `callGateway()` (9 chamadores)
Substituir `supabase.functions.invoke('nome-função')` por `callGateway('admin', 'action')`:

| Arquivo | Chamada atual | Nova chamada |
|---|---|---|
| `src/components/admin/ReleaseSignatureStatusCard.tsx:29` | `invoke('get-admin-releases')` | `callGateway('admin', 'get-admin-releases')` |
| `src/components/members/CreateUserForm.tsx:82` | `invoke('admin-create-user', {body})` | `callGateway('admin', 'create-user', body)` |
| `src/hooks/useActiveTenant.tsx:50` | `invoke('set-active-tenant', {body})` | `callGateway('admin', 'set-active-tenant', body)` |
| `src/hooks/useActiveTenant.tsx:217` | `invoke('set-active-tenant', {body})` | `callGateway('admin', 'set-active-tenant', body)` |
| `src/pages/admin/AgentReleases.tsx:44` | `invoke('get-admin-releases')` | `callGateway('admin', 'get-admin-releases')` |
| `src/pages/admin/Members.tsx:35` | `invoke('list-users', {body})` | `callGateway('admin', 'list-users', body)` |
| `src/pages/admin/Members.tsx:79` | `invoke('remove-member', {body})` | `callGateway('admin', 'remove-member', body)` |
| `src/pages/admin/Members.tsx:113` | `invoke('update-user-role', {body})` | `callGateway('admin', 'update-user-role', body)` |
| `src/pages/admin/RateLimitingStats.tsx:50` | `invoke('get-rate-limit-stats', {body})` | `callGateway('admin', 'rate-limit-stats', body)` |

#### Etapa 2: Inline 3 funções API-key
As 3 funções `api-tenant-*` usam `authenticateApiKey()` (não JWT). Serão inlined em `admin.ts` com import da lógica de API key auth:
- `handleTenantFeatures` — 50L, leitura de features do tenant
- `handleTenantInfo` — 64L, info básica do tenant
- `handleTenantStats` — 66L, stats agregados (agents, scans, quarantine, jobs)

Mover de `API_KEY_PROXY` para `INLINED_HANDLERS` com detecção automática: se o payload contiver `__apiKey` ou o request tiver header `Authorization` sem Bearer JWT, usar o fluxo de API key.

**Decisão de custo**: Como estas 3 funções são chamadas por integrações externas (não pelo frontend), mantê-las como proxy **não adiciona cold start ao frontend**. Recomendo **manter como proxy** nesta fase para evitar complexidade desnecessária.

#### Etapa 3: Deletar standalone functions (10 já inlined)
Deletar os diretórios das 10 funções já inlined + remover deploys:
- `get-admin-releases`, `update-user-status`, `update-member-role`, `remove-member`, `list-users`, `list-all-users-admin`, `set-active-tenant`, `update-user-role`, `admin-create-user`, `get-rate-limit-stats`

#### Etapa 4: Validação
- Build TypeScript (zero erros)
- Deploy api-gateway
- Teste curl em ações críticas: `admin:list-users`, `admin:create-user`, `admin:set-active-tenant`

### Resultado Esperado
- **10 funções standalone deletadas** (economia de cold starts)
- **3 funções API-key mantidas como proxy** (isolamento de auth)
- **9 chamadores frontend migrados** para padrão unificado `callGateway`
- **Latência p95 reduz ~50%** para operações admin no frontend
