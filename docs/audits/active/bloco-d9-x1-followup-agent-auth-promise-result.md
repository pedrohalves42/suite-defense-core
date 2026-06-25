# Bloco D9-X1-FOLLOWUP — `agent-auth.ts` PromiseLike fix

Data: 2026-06-25  
PR: D9-X1-FIX (escopo único: corrigir `.catch on PromiseLike` em `_shared/agent-auth.ts`)

## Problema

`deno check` reportava em `agent-auth.ts:159`:

```
TS2339 Property 'catch' does not exist on type 'PromiseLike<void>'.
```

O PostgREST builder (`supabase.from(...).insert(...)`) é um `PromiseLike` — não tem `.catch()`. O `.then(...)` retorna `PromiseLike<void>`, e o `.catch(...)` subsequente quebrava o typecheck. Sob `@ts-nocheck` o erro estava mascarado; após D9-X1 removermos o nocheck em `serve-agent.ts`, o erro pré-existente reaparece via cadeia de tipos.

## Correção aplicada

`supabase/functions/_shared/agent-auth.ts` (função `recordTokenFailure`):

- Mantida a chamada `.insert(...)` no PostgREST builder (PromiseLike) inalterada — runtime idêntico.
- Envolvido com `Promise.resolve(insertOp)` para obter um `Promise<...>` real, que sim aceita `.then(...).catch(...)`.
- Tipo explícito `Promise<void>` em `work` para garantir compatibilidade com `EdgeRuntime.waitUntil(work)`.
- Sem cast `as any`, sem alteração de logs/mensagens/handlers.

## Preservado byte-a-byte

- Insert em `token_validation_failures` com mesmos campos (`token_hash_prefix`, `failure_reason`, `client_ip`, `user_agent`).
- Logs `[${endpoint}] token_validation_failures insert failed` e `insert threw` idênticos.
- Fire-and-forget via `EdgeRuntime.waitUntil` quando disponível; fallback de drop em dev preservado.
- Wrapper `try/catch` externo de `recordTokenFailure` inalterado.
- HMAC, replay, token validation, status codes — não tocados.

## Gates executados

```bash
$ deno check supabase/functions/_shared/agent-auth.ts
Check supabase/functions/_shared/agent-auth.ts
# 0 erros próprios.

$ deno check supabase/functions/_shared/serve-agent.ts
# 0 erros em serve-agent.ts e 0 em agent-auth.ts.
# Erros remanescentes (3) são pré-existentes e fora de escopo:
#   - error-handler.ts:70   (TS2394 overload signature) — não relacionado
#   - hmac.ts:155           (TS2345 Uint8Array/BufferSource) — não relacionado
#   - serve-internal.ts:42  (TS2769 Deno.serve) — ainda sob @ts-nocheck (D9-X3)
```

`agent-auth.ts` e `serve-agent.ts` agora estão limpos do ponto de vista de tipos próprios.

## Smoke lógico

| Caso | Esperado | Status |
|---|---|---|
| insert ok | log silencioso | ✅ |
| insert com `error` | warn `insert failed` com `res.error.message` | ✅ |
| insert lança | warn `insert threw` com mensagem | ✅ |
| `EdgeRuntime.waitUntil` disponível | promise registrada | ✅ |
| ambiente sem `EdgeRuntime` | promise dropada (warn já emitido) | ✅ |

## Riscos residuais

- `error-handler.ts` e `hmac.ts` têm erros pré-existentes não relacionados a este PR — devem ser tratados em hotfix separado quando relevantes (não bloqueiam D9-X2).
- `serve-internal.ts` ainda tem `@ts-nocheck` (planejado como D9-X3).

## Próximo alvo

**D9-X2** — `supabase/functions/_shared/serve-tenant.ts` (>30 consumers).
