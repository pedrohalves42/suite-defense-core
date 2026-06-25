# D9-X6 — `_shared/hmac-success-coalescer.ts` inventory

## Pre-fix `deno check`

```
Check _shared/hmac-success-coalescer.ts  → 0 errors
```

Arquivo já estava em boa forma desde PP02-A:
- `CoalescerClientLike` tipa o subset do SupabaseClient usado (apenas `from().upsert()`).
- `CoalescerMetrics` tipa todos os contadores.
- `FormatCacheUpsertRow` tipa o payload do upsert.
- Nenhum `@ts-nocheck`.
- Nenhum `any` explícito.

## `any`/`unknown` residuais

| Linha | Trecho                       | Ação |
|-------|------------------------------|------|
| 134   | `catch (err)` + `(err as Error).message` | trocar para `unknown` + narrowing |
| 212   | `catch (err)` + `(err as Error).message` | trocar para `unknown` + narrowing |

Nenhuma outra mudança necessária. `supabase: any` **não existe** aqui — o arquivo usa
`CoalescerClientLike`, que é mais estrito que `any`. Manter como está.

## Consumers mapeados

```
supabase/functions/_shared/hmac.ts
  - enqueueFormatCacheUpsert (success path, flag ON)
  - inlineFormatCacheUpsert  (success path, flag OFF)
supabase/functions/_shared/__tests__/hmac-success-coalescer.test.ts
  - 4 cenários: LRU dedupe, batch flush, batch failure fallback, inline bypass
```

Nenhum outro consumer. Contrato com `_shared/hmac.ts` permanece estável.

## Proibido mexer (recap do escopo)

- TTL do LRU (30s)
- chave de dedupe (`agent_id`)
- flush threshold (`maxBatchSize=50`)
- intervalo de flush (`flushIntervalMs=1500`)
- fallback por linha
- nomes/contagem de métricas
- default OFF da feature flag (lida em `hmac.ts`, não aqui)
- contrato com `_shared/hmac.ts`
- `EdgeRuntime.waitUntil` (agendamento fica em `hmac.ts`)
- decisão de autenticação (coalescer só roda em success path)
