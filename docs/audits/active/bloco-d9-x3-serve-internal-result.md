# Bloco D9-X3 — `_shared/serve-internal.ts` resultado

Data: 2026-06-25  
PR: D9-X3  
Escopo: tipagem estrita do helper `serveInternal`. Runtime, auth, status e ctx preservados.

## Consumers mapeados

9 funções (`check-tenant-abuse`, `upload-release-content`, `setup-agent-script`, `ai-system-analyzer`, `ai-predict-agent-failure`, `ai-insight-dispatcher`, `evaluate-playbook-triggers`, `evaluate-automation-rules`, `autonomous-safe-mode`). Detalhe em `bloco-d9-x3-serve-internal-inventory.md`.

## Estado inicial

- `@ts-nocheck`: **não presente** (helper já estava sem o supressor).
- Débitos de tipo: `InternalContext.supabase: any`, `createClient<any>(...)`, sem retorno explícito nas funções.

## Alterações feitas

| Mudança | Antes | Depois |
|---|---|---|
| Import de tipos | `SupabaseClient` não tipado | `import type { Database }` + `SupabaseClient<Database>` |
| `InternalContext.supabase` | `any` | `SupabaseClient<Database>` |
| `createClient<any>` | `<any>` | `<Database>` com variável anotada |
| `assertInternalCaller` | `if (authError) return authError` | narrowing via `instanceof Response` |
| `jsonResponse` / `errorResponse` | retorno implícito | retorno explícito `: Response` |
| `serveInternal` | retorno implícito | retorno explícito `: void` |
| Handler dispatch | objeto inline | `const ctx: InternalContext = { ... }` |

## Preservado (byte-for-byte)

- ✅ Validação via `assertInternalCaller(req)` — sem options, sem afrouxar checks.
- ✅ `service_role` lida via `requireEnv('SUPABASE_SERVICE_ROLE_KEY')`.
- ✅ `X-Trace-ID` / `X-Request-ID` resolution.
- ✅ CORS via `buildCorsHeaders(origin ?? null)`, OPTIONS retorna 204-equivalente sem body.
- ✅ Status codes (200 / 401 / 403 / 500) e códigos de erro (`UNAUTHORIZED` / `FORBIDDEN` / `ERROR`).
- ✅ Logger `loggerWithContext({ requestId, traceId })` mantido.
- ✅ Body parse permissivo (`{}` em falha de JSON).
- ✅ Dynamic import de `assert-internal-caller.ts` preservado.

## Proibições respeitadas

- ❌ não tocou `hmac.ts`
- ❌ não tocou `error-handler.ts`
- ❌ não alterou consumers
- ❌ não trocou chave/escopo de auth
- ❌ não alterou banco/RLS/RPC/migrations

## Gates

| Check | Resultado |
|---|---|
| `deno check supabase/functions/_shared/serve-internal.ts` | ✅ 0 erros |

## Smoke lógico

| Caso | Esperado | Estado |
|---|---|---|
| Chamada com service_role válido | handler executa | ✅ inalterado (caminho `assertInternalCaller`) |
| Header `X-Internal-Secret` válido | handler executa | ✅ inalterado |
| Sem auth / secret inválido | 401 `UNAUTHORIZED` | ✅ retorno de `assertInternalCaller` preservado |
| Preflight `OPTIONS` | resposta vazia + CORS | ✅ branch inalterado |
| Body JSON inválido | `body = {}` | ✅ inalterado |
| Handler retorna `Response` | passa direto | ✅ `instanceof Response` |
| Handler retorna objeto | wrap em `jsonResponse(200)` | ✅ inalterado |
| Erro interno | 500 + log estruturado | ✅ inalterado |

## Erros remanescentes (fora de escopo)

- `_shared/error-handler.ts` — alvo de **D9-X4**.
- `_shared/hmac.ts` — alvo de **D9-X5**.
- `_shared/serve-agent.ts` — issues residuais (não causadas por este PR).

## Próximo alvo recomendado

**D9-X4 — `_shared/error-handler.ts`**: remover `@ts-nocheck` (se presente) e tipar `errorResponse` / mapeamentos de status, sem mudar mensagens nem códigos.
