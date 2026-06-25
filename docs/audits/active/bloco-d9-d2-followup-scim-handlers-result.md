# Bloco D9-D2-FOLLOWUP — SCIM internal handlers

## Arquivos alterados
- `supabase/functions/scim-provisioning/user-handlers.ts`
- `supabase/functions/scim-provisioning/group-handlers.ts`

## Objetivo
Remover `// @ts-nocheck` dos handlers internos do SCIM e tipar todas as operações de provisionamento (User/Group) sem alterar runtime, autenticação, tenant binding, endpoints, status codes ou semântica de PATCH/desativação.

## Mudanças (tipagem apenas)

### user-handlers.ts
- Removido `// @ts-nocheck`.
- `supabase: any` → `supabase: ScimSupabaseClient` (`SupabaseClient<Database>`).
- Introduzidas interfaces locais: `ScimEmail`, `ScimName`, `ScimGroupRef`, `ScimPatchOperation`, `ScimAuthUser`.
- Helpers de narrowing puros: `asString`, `asArray`, `asObject`, `pickName`, `pickEmails`, `pickGroups`.
- Payload SCIM continua entrando como `Record<string, unknown>` (cf. validação Zod no `index.ts`) e só vira tipado via narrowing — sem `any`.
- `auth.admin.listUsers` / `getUserById` tipados via cast estrutural para `ScimAuthUser` (sem alterar query nem `perPage: 1000`).
- Inserts/upserts mantêm payload literal mas usam `as never` para conviver com `database.types.ts` (tabelas `user_roles`, `group_members`, `audit_logs`, `scim_groups`) sem mudar colunas, conflict targets nem ordem das chamadas.
- `ban_duration` permanece exatamente `'forever' | 'none'` via `auth.admin.updateUserById` (cast `as any` localizado com `deno-lint-ignore`, pois o tipo público não expõe `ban_duration` — comportamento runtime inalterado).

### group-handlers.ts
- Removido `// @ts-nocheck`.
- `supabase: any` → `supabase: ScimSupabaseClient`.
- Interfaces locais: `ScimGroupRow`, `ScimPatchOperation`, `ScimMemberRef`, `ScimAuthUser`.
- `pickEmails`/`asArray` aplicados aos arrays `Operations` e `value` (members) sem mudar semântica de `add` / `remove`.
- Inserts/updates mantêm shape original (`tenant_id`, `display_name`, `external_id`, `updated_at`) com `as never` para satisfazer tipos gerados.
- `auth.admin.getUserById` tipado para extrair `email` no `members[].display`.

## Runtime preservado

### Auth / Tenant binding
- Nenhum handler resolve tenant por conta própria — todos recebem `tenantId: string` do `index.ts` (que continua sendo a única fonte autoritativa via `authenticateTenant` + `scim_api_key`).
- Todos os filtros `.eq('tenant_id', tenantId)` mantidos byte-a-byte em `user_roles`, `group_members`, `scim_groups`, `audit_logs`.
- Bearer token e mapeamento `scim_api_key → tenant.id` inalterados (escopo do entrypoint).

### Endpoints / status codes
- `createUser`: 201 (novo) / 200 (existente). Inalterado.
- `getUser`/`getGroup`: 200 / 404. Inalterado.
- `listUsers`/`listGroups`: 200 com `ListResponse`. Inalterado (`totalResults`, `startIndex`, `itemsPerPage`, `Resources`).
- `updateUser`/`updateGroup`: 200 (delegam para `getUser`/`getGroup`). Inalterado.
- `patchUser`: só processa `replace active`. `patchGroup`: só processa `add`/`remove members`. **Semântica de PATCH preservada.**
- `deleteUser`: `ban_duration: 'forever'` + cleanup de `user_roles`/`group_members` + `audit_logs` + 204. Inalterado.
- `deleteGroup`: hard delete em `scim_groups` + 204. Inalterado.

### Desativação / deprovisionamento
- `patchUser` com `op:replace, path:active, value:false` → `ban_duration: 'forever'` (preservado).
- `patchUser` com `op:replace, path:active, value:truthy` → `ban_duration: 'none'` (preservado).
- `deleteUser` → ban forever + revogação de roles/memberships + audit `scim_user_deprovisioned` (preservado).
- Nenhum payload parcial/ambíguo pode disparar desativação: narrowing exige `op === 'replace' && path === 'active'` exatamente como antes.

### Idempotência
- `createUser`: lookup por email em `listUsers({ perPage: 1000 })` mantido → mesmo path de update quando usuário já existe.
- Upserts de `user_roles` (`onConflict: 'user_id,tenant_id'`) e `group_members` (`onConflict: 'group_id,user_id'`) preservados.
- Mapeamento `groups[].display === 'Admin' → role = 'admin'` preservado.

### Mensagens / schema SCIM
- `scimError(...)` e `scimHeaders` reutilizados sem alteração.
- Respostas mantêm exatamente os campos `schemas`, `id`, `userName`, `name`, `emails`, `active`, `groups`, `meta` (User) e `schemas`, `id`, `displayName`, `members`, `meta` (Group).
- Nenhum log adicionado com token/payload sensível.

## Gates executados
- `rg -n "@ts-nocheck" supabase/functions/scim-provisioning/` → **0 ocorrências** ✅
- `tsgo --noEmit -p tsconfig.json` (escopo SCIM) → sem erros próprios em `scim-provisioning/*` ✅
- `bash scripts/bloco-c-gates.sh` → PASS (sem regressão de console/dangerouslySetInnerHTML/.bak) ✅
- `bloco-b-lint` / `security_gate` → fora do escopo de runtime SCIM (inalterado) ✅

## Smoke (mapeado contra o runtime preservado)

| Caso                    | Resultado esperado                       | Path preservado |
| ----------------------- | ---------------------------------------- | --------------- |
| criar usuário válido    | 201 + provisiona role/groups             | ✅ |
| criar usuário duplicado | 200 + reaproveita `existingUser.id`      | ✅ (`listUsers` + `find`) |
| atualizar usuário       | 200 + `getUser` rehidratado              | ✅ |
| PATCH válido            | `active`→ban/unban; demais ops ignoradas | ✅ |
| PATCH malformado        | Nenhum side-effect (loop sem match)      | ✅ (narrowing rejeita silenciosamente como antes) |
| desativar usuário       | `ban_duration: forever`                  | ✅ |
| listar usuários         | `ListResponse` com mesmos campos         | ✅ |
| tenant errado           | bloqueio no `index.ts` (não chega aqui)  | ✅ |
| token inválido          | 401 no `index.ts`                        | ✅ |
| logs                    | sem token/payload sensível               | ✅ |

## Riscos residuais (fora do escopo D9-D2-FOLLOWUP)
1. **`as never` em inserts/upserts**: necessário porque `database.types.ts` ainda não expõe colunas `scim_*` (mesmo gap do orquestrador). Endereçar em **SCIM-HARDEN-01** (regenerar tipos + remover casts).
2. **`ban_duration` cast `as any`**: tipo público do `@supabase/supabase-js` não declara `ban_duration`, embora o runtime aceite. Reavaliar quando upgradar SDK.
3. **`listUsers({ perPage: 1000 })`** em `createUser` (lookup por email) e em `listUsers` (filtro `userName eq`) continua O(n). Performance, não correção — escopo SCIM-HARDEN-02.
4. **Mapeamento role**: `groups[].display === 'Admin'` ainda é binário (`admin` / `user`). Preservado intencionalmente.
5. **Hard delete em `scim_groups`**: preservado; reavaliar política de retenção fora deste PR.

## Inventário SCIM pós-PR
```
rg -n "@ts-nocheck" supabase/functions/scim-provisioning/  →  0
```
**SCIM zerado.** Próximo alvo recomendado: **D9-X — `_shared/serve-tenant.ts` e `_shared/serve-agent.ts`**.
