# PR D9-X2 — `_shared/serve-tenant.ts`

Data: 2026-06-25
Status: ✅ Concluído

## Objetivo

Remover `// @ts-nocheck` de `supabase/functions/_shared/serve-tenant.ts` com tipagem
real, sem alterar runtime nem o contrato consumido pelos >30 consumers.

## Alterações (escopo estrito)

| Arquivo | Mudança |
|---|---|
| `supabase/functions/_shared/serve-tenant.ts` | Removido `// @ts-nocheck` |
| `supabase/functions/_shared/serve-tenant.ts` | `resolveDefaultTenant(supabase: any, …)` → `SupabaseClient<Database>` |
| `supabase/functions/_shared/serve-tenant.ts` | `verifyUserTenantAccess(supabase: any, …)` → `SupabaseClient<Database>` |
| `supabase/functions/_shared/serve-tenant.ts` | `data?.tenant_id || null` → `(data?.tenant_id as string \| undefined) ?? null` (narrowing puro) |

Nenhuma outra linha alterada. Re-exports (`servePublic`, `serveAgent`, `serveInternal`
e seus tipos) preservados byte-a-byte. Consumers **não foram tocados**.

## Contrato preservado

### `TenantContext<T>` — shape inalterado
- `tenantId: string`
- `userId: string | null`
- `isInternal: boolean`
- `supabase: SupabaseClient<Database>` (já estava tipado)
- `requestId: string`
- `body: T`
- `req: Request`

### `ServeOptions` — inalterado
`tenantSource`, `allowFallback`, `methods`, `skipTenantValidation`, `rateLimit`,
`handlerTimeoutMs`.

### Fluxo runtime preservado
- CORS / OPTIONS preflight (`buildCorsHeaders(origin)`)
- Method check → 405
- Auth: `X-Internal-Secret` (timing-safe) → service_role Bearer (timing-safe) →
  bloqueio de agent_token em rota tenant → JWT user → 401 sem auth
- Resolução de tenant: `body.tenant_id` → header `x-tenant-id`
- Validação:
  - internal sem `tenant_id` → 400
  - user com `tenant_id` sem acesso → 403
  - user sem `tenant_id` + `allowFallback` → `resolveDefaultTenant` ou 403
  - user sem `tenant_id` + `!allowFallback` → 400
- Rate limit (opcional) → 429 com `Retry-After`
- `withTimeout` no handler (default 25s)
- `handleExceptionWithContext` no catch global

Mensagens de erro, status codes, headers (`X-Request-ID`, `X-Trace-ID`,
`X-Response-Time`) e códigos (`UNAUTHORIZED`, `FORBIDDEN`, `RATE_LIMITED`, `ERROR`)
mantidos.

## Checks

```bash
deno check supabase/functions/_shared/serve-tenant.ts
# → 0 erros no próprio arquivo
```

Consumers representativos:

```bash
deno check supabase/functions/public-gateway/index.ts \
           supabase/functions/scim-provisioning/index.ts \
           supabase/functions/saml-sso/index.ts
```

→ 0 erros novos atribuíveis a serve-tenant.ts. Os 4 erros reportados são
pré-existentes e fora do escopo D9-X2 (ver abaixo).

## Erros remanescentes (fora de escopo)

| Arquivo | Erro | PR alvo |
|---|---|---|
| `_shared/error-handler.ts:58` | TS2394 overload signature | (próprio PR) |
| `_shared/hmac.ts:155` | TS2769 `crypto.subtle.digest` BufferSource | (próprio PR) |
| `_shared/serve-internal.ts:42` / `serve-agent.ts:119` | TS2769 / TS2339 | **D9-X3** (serve-internal), preexistente em serve-agent |
| `saml-sso/index.ts:176` | TS2769 insert `role` cast | followup saml-sso |
| `scim-provisioning/user-handlers.ts:77` | TS2677 type predicate | followup SCIM |

Nenhum desses depende ou foi introduzido por D9-X2.

## Consumers mapeados

Ver `docs/audits/active/bloco-d9-x-inventory.md` (>30 consumers de `serveTenant`
+ 11 de `serveAgent` via re-export). Nenhum precisou ser alterado.

## Próximo alvo

**D9-X3 — `_shared/serve-internal.ts`** (recomendado), sob autorização explícita.
