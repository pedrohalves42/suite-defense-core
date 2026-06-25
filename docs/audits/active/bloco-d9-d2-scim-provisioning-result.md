# Bloco D9-D2 — scim-provisioning/index.ts

## Arquivo alterado
- `supabase/functions/scim-provisioning/index.ts`

## Objetivo
Remover `// @ts-nocheck` do orquestrador SCIM 2.0 sem alterar runtime, autenticação, tenant binding ou semântica de provisionamento.

## Mudanças (tipagem apenas)
- Removido `// @ts-nocheck`.
- Importado `SupabaseClient` e `Database` (tipos).
- Adicionado alias local `ScimSupabaseClient = SupabaseClient<Database>` e interface `ScimTenant` (somente leitura).
- `parseAndValidateScimBody` agora aceita `z.ZodTypeAny` (compatível com `passthrough()`).
- `authenticateTenant` tipado com `ScimSupabaseClient` e retorno `ScimTenant | null` — query mantida byte-a-byte (`from('tenants').select('id, name, scim_config').eq('scim_api_key', apiKey).maybeSingle()`).
- Handler do `servePublic` recebe `ctx.supabase` cast para `ScimSupabaseClient`; removida desestruturação de variáveis não usadas (`requestId`, `rawBody`) — payload bruto continua sendo lido por cada `parseAndValidateScimBody(req, ...)`.

## Runtime preservado
- Bearer token + `scim_api_key` → tenant: inalterado.
- Tenant binding (`tenant.id` em todos os handlers de User/Group): inalterado.
- Endpoints discovery (`/ServiceProviderConfig`, `/ResourceTypes`, `/Schemas`): inalterados.
- Roteamento `/Users[/:id]` e `/Groups[/:id]` com `POST/GET/PUT/PATCH/DELETE`: inalterado.
- Filtro `userName eq "..."` via `auth.admin.listUsers({ perPage: 1000 })`: inalterado.
- Idempotência (delegada a `userHandlers` / `groupHandlers`): inalterada.
- Status codes (401 invalid auth, 400 payload, 404 resource, 500 fallback): inalterados.
- Mensagens de erro SCIM (`scimError`) preservadas.
- Rate limit `scim` (100 req/min) preservado.

## Auth / tenant binding
- Nenhuma rota escapa de `authenticateTenant`.
- `tenant.id` é o único identificador de tenant repassado para User/Group handlers.
- Operações `active: false` / `DELETE` continuam exigindo `userId/groupId` explícito no path — tipagem nova não introduz coerção de payload.

## Gates
- `scripts/bloco-c-gates.sh` → PASS
- `tsgo --noEmit` no arquivo alvo → sem erros próprios (warning de config global pré-existente).
- `bloco-b-lint` / `security_gate` não tocam runtime SCIM.

## Riscos residuais (fora do escopo D9-D2)
1. `authenticateTenant` ainda usa um cast estrutural (`as unknown as ...`) porque `tenants.scim_api_key` não existe nos tipos gerados. Endereçar em **SCIM-HARDEN-01** (regerar `database.types.ts` ou usar RPC dedicada).
2. `scimError(500, error.message)` ainda pode propagar mensagens internas em casos de exceção não tratada nos handlers — preservado intencionalmente para não alterar contrato; tratar em **SCIM-HARDEN-01**.
3. `user-handlers.ts` e `group-handlers.ts` continuam com `@ts-nocheck` e `supabase: any` — endereçar em **D9-D2-FOLLOWUP** (tipagem dos handlers SCIM).
4. `auth.admin.listUsers({ perPage: 1000 })` em filtro `userName eq` permanece O(n) — performance, não correção.

## Próximo alvo recomendado
- **D9-D2-FOLLOWUP** — tipar `scim-provisioning/user-handlers.ts` e `group-handlers.ts` (handlers internos), preservando idempotência e mapeamento User/Group.
- Após fechar D9-D2-FOLLOWUP: **D9-D3** (próxima função sensível do bloco D9-D — confirmar inventário antes).
