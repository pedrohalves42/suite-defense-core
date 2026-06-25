# D9-X4 — Resultado `_shared/error-handler.ts`

## Escopo executado
PR cirúrgico de tipagem em `supabase/functions/_shared/error-handler.ts`.

## Estado prévio
- `@ts-nocheck`: ausente
- `any`: ausente
- Interfaces (`ErrorContext`, `StandardError`) e enum (`ErrorCode`) já tipados
- 2 casts inseguros (`as number`, `as string`) na implementação dos overloads de `createErrorResponse`

## Alterações
1. Substituídos casts `as number` / `as string` na implementação de `createErrorResponse` por **narrowing via `typeof`**, preservando comportamento padrão (status `500` quando ausente, mensagem `''` no overload legado se não houver string).
2. Trocado `origin || null` por `origin ?? null` para coerência com o restante do helper (não altera runtime — `origin` é `string | null | undefined`).
3. Adicionada checagem `errorOrCode !== null` antes de `'error' in errorOrCode` (defesa contra `null` em runtime; sem mudança de saída).

## Preservado byte-a-byte
- Formato JSON externo
- Status codes (400/401/403/404/500/...)
- Headers (CORS + `Content-Type: application/json`)
- Mensagens públicas
- Política produção × dev (mascaramento, omissão de stack/context)
- Assinatura pública das funções e overloads
- Logger e campos de log

## Validações executadas
- `deno check _shared/error-handler.ts` → **0 erros novos** introduzidos pelo PR
- 2 erros **pré-existentes** confirmados e mantidos fora de escopo:
  - `TS2394` / `TS2750` — overload 1 de `createErrorResponse` (posição 3: `origin?: string|null`) incompatível com a posição 3 da implementação (`status?: number`). Corrigir exige mudar o contrato público dos consumers (api-gateway, ops-gateway, build-agent-exe, serve-public). **Recomenda-se PR isolado D9-X4-FIX**.

## Gates
- Lint anti-regressão Bloco B: não aplicável (sem mudança em policies/RLS)
- Bloco C gates: não aplicável (sem `console.*`, sem `dangerouslySetInnerHTML`, sem `.bak`)

## Erros remanescentes fora de escopo
- `TS2394`/`TS2750` em `_shared/error-handler.ts` (overload 1 de `createErrorResponse`)
- `_shared/hmac.ts` ainda contém `@ts-nocheck` → alvo de **D9-X5**

## Próximo alvo
**D9-X5 — `_shared/hmac.ts`** (após aprovação). Atenção máxima: byte-a-byte HMAC, replay window, coalescer (PP02-A/B), `EdgeRuntime.waitUntil`.
