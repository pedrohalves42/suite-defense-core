# D9-C — stripe-webhook/index.ts

**Status:** ✅ PASS  
**Escopo:** `supabase/functions/stripe-webhook/index.ts`

## Mudanças aplicadas

- Removido `// @ts-nocheck`.
- Importado `SupabaseClient` + `Database` e aplicado cast tipado (`as SupabaseClient<Database>`) no client repassado aos handlers.
- Tipado `Stripe.Event` no retorno de `constructEventAsync`.
- Mensagens de erro narrowing via `err instanceof Error`.
- Comentário explícito marcando o raw body como obrigatório para HMAC.
- Log de evento desconhecido enriquecido com `traceId` + `eventId` (sem PII/segredos).

## Runtime preservado

- ✅ Raw body (`ctx.rawBody`) continua sendo a fonte da verificação HMAC.
- ✅ `Stripe.createSubtleCryptoProvider()` + `constructEventAsync` inalterados.
- ✅ Mesmos status codes (400 sem assinatura/body, 500 sem secret, 400 em erro genérico).
- ✅ Mesma lista de eventos tratados (checkout/subscription.*/invoice.payment_failed).
- ✅ Mesmos handlers em `event-handlers.ts` (fora de escopo — candidatos a um D9-X).
- ✅ Rate limit e idempotência preservados (handlers usam `stripe_event_id`).

## Logs

Sem vazamento — apenas `event.type`, `event.id`, `traceId`. Nenhum dump de body, customer completo ou secret.

## Gates

- `bash scripts/bloco-c-gates.sh` → PASS
- `rg @ts-nocheck supabase/functions/stripe-webhook/` → 0

## Riscos residuais

- `event-handlers.ts` ainda tipa `supabase: any` — fora do escopo D9-C; sugerido **D9-X / D9-C-FOLLOWUP** dedicado para tipagem dos handlers sem alterar SQL/efeitos.
