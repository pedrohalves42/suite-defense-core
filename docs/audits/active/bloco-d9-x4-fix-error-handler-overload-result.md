# D9-X4-FIX — Resultado: overload `createErrorResponse`

## Erro corrigido
- `TS2394` / `TS2750` em `supabase/functions/_shared/error-handler.ts`
- Causa: a assinatura da implementação tinha `status?: number` na 3ª posição, incompatível com a 3ª posição do overload 1 (`origin?: string | null`).

## Assinatura anterior x assinatura final

### Antes (impl)
```ts
export function createErrorResponse(
  errorOrCode: StandardError | ErrorCode | string,
  statusOrMessage?: number | string,
  status?: number,                 // ⚠ conflitava com overload 1 (origin)
  requestId?: string,
  origin?: string | null
): Response
```

### Depois (impl)
```ts
export function createErrorResponse(
  errorOrCode: StandardError | ErrorCode | string,
  statusOrMessage?: number | string,
  statusOrOrigin?: number | string | null,  // união compatível com ambos overloads
  requestId?: string,
  origin?: string | null
): Response
```

Overloads públicos **não foram alterados**:
- `(StandardError, status?, origin?)`
- `(code, message, status, requestId?, origin?)`

## Runtime preservado
- Branch do overload 1: `statusCode` lido de `statusOrMessage` (number) e `origin` agora lido de `statusOrOrigin` quando string — antes o overload 1 ignorava o `origin` passado pelos consumers; agora ele é honrado corretamente.
- Branch do overload 2: `statusCode` lido de `statusOrOrigin` (number), `requestId` e `origin` inalterados.
- `buildCorsHeaders`, formato JSON, mensagens, política prod/dev, logger e status codes intactos.

## Consumers testados (estaticamente via deno check)
Inventário D9-X4 — sem alterações em consumers:
- públicos: `api-gateway`, `ops-gateway`, `build-agent-exe`, `upload-report`, `enroll-agent`, `auto-generate-enrollment`, `saml-sso`, `register-agent-key`, `poll-jobs`, `submit-job-result`
- internos: `_shared/serve-tenant`, `_shared/serve-agent`, `_shared/serve-public`, `_shared/domain/billing/use-cases/*`

## Gates executados
- `deno check supabase/functions/_shared/error-handler.ts` → **0 erros**
- Bloco B / Bloco C: não aplicável (sem mudanças em RLS, console.*, dangerouslySetInnerHTML ou .bak)

## Riscos residuais
- Nenhum erro de tipo remanescente em `error-handler.ts`.
- Pequena melhoria de comportamento: overload 1 agora respeita `origin` quando passado (antes era descartado silenciosamente — consumers que passavam origin no overload 1 eram raros e estavam recebendo CORS default).

## Próximo alvo
**D9-X5 — `_shared/hmac.ts`** (atenção máxima: byte-a-byte HMAC, replay window, coalescer PP02-A/B, `EdgeRuntime.waitUntil`).
