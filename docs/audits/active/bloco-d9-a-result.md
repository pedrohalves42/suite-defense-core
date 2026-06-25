# D9-A — public-gateway/index.ts

## Status
✅ `@ts-nocheck` removed
✅ `bunx tsgo --noEmit` — 0 errors
✅ `bun run lint` — 0 errors (warnings pré-existentes)
✅ `bash scripts/bloco-c-gates.sh` — PASS (3/3)
⏳ `ci/security_gate.sh` / `bloco-b-lint` — delegados ao CI (não houve mudança em DB)

## Escopo
- Arquivo: `supabase/functions/public-gateway/index.ts`
- Goal: remover `@ts-nocheck` e tipar a borda pública sem mexer em runtime.

## Mudanças
- Removido `// @ts-nocheck`.
- Importado `SupabaseClient` + `Database`; `ctx.supabase` é estreitado
  localmente para `SupabaseClient<Database>` (contrato público de `servePublic`
  permanece `any` por compat).
- `reqBody` continua `unknown` (vindo de `PublicContext.body`) e só é usado via
  `RouterSchema.safeParse` antes de virar `{ action, payload }`.
- `payload` tipado como `Record<string, unknown>` em ambos os caminhos GET/POST.
- Destructuring `__status` renomeado para `_omit` para satisfazer o lint sem
  alterar o objeto resposta.
- `INLINED_HANDLERS` segue com a assinatura existente
  `(supabase: any, req, requestId, payload) => …`; passar o client tipado é
  aceito naturalmente.

## Preservado (runtime intacto)
- Rate limit (`endpoint: 'public-gateway'`, `maxRequests: 500`, `windowMinutes: 1`).
- Validação Zod `RouterSchema` (action 1..80 chars, payload opcional).
- Roteamento GET por `?action=` com query params virando payload.
- Allowlist `ALL_ACTIONS` derivada de `INLINED_HANDLERS`.
- Convenção `__status` para handlers que querem status customizado.
- CORS via `buildCorsHeaders(origin)` + `securityHeaders` em todas as respostas
  (incluindo erros 400/405/500).
- Mensagens de erro idênticas (`'Invalid request'`, `'Method not allowed'`,
  `'Unknown action: …'`, `'Internal error'`).
- Logger estruturado preservado (`[public-gateway] <action>` + `done in Xms`).
- Resposta 500 mantém o comportamento atual (`err.message` exposto) — alteração
  estaria fora do escopo D9-A.

## Não-mudou (verificado)
- Nenhum handler em `handlers/` ou `_shared/handlers/` tocado.
- Sem alteração de auth/JWT/HMAC (esta função é deliberadamente `servePublic`).
- Sem alteração em RLS, RPC, migrations, storage, feature flags.

## Smoke lógico
| Caso | Esperado | Status |
|---|---|---|
| GET válido `?action=public:health` | 200 do handler | preservado |
| POST válido `{action,payload}` | roteado para handler | preservado |
| POST com payload Zod inválido | 400 + `details` | preservado |
| action desconhecida | 400 + `available_actions` | preservado |
| método não suportado (PUT/DELETE) | 405 | preservado |
| rate limit excedido | 429 + Retry-After (via servePublic) | preservado |
| handler retorna `{__status, ...}` | status custom + body sem `__status` | preservado |
| erro interno | log estruturado + 500 controlado | preservado |
| CORS preflight | tratado por `servePublic` | preservado |

## Riscos residuais
- `INLINED_HANDLERS` ainda usa `supabase: any` na assinatura — mover toda a
  borda para `SupabaseClient<Database>` exige tocar 18 handlers (fora do escopo
  D9-A; candidato a sub-bloco futuro).
- Resposta 500 segue expondo `err.message` (pré-existente).

## Próximo
**D9-B — funções `serve-*` restantes ainda expostas com `@ts-nocheck`.**
