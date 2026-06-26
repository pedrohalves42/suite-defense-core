# Bloco D12-B8 — `_shared/domain-events.ts` cleanup result

**Status:** ✅ Concluído
**Escopo:** remoção da diretiva `@ts-nocheck` em `supabase/functions/_shared/domain-events.ts` e correção type-only do `TS2769` em `new Date(row.occurred_on)`.

## Arquivo alterado

| Arquivo | Mudança |
| --- | --- |
| `supabase/functions/_shared/domain-events.ts` | Removida diretiva `// @ts-nocheck`. Adicionados 4 helpers de narrowing type-only (`asString`, `asOptionalString`, `asPayload`, `asDateInput`) usados apenas no `replayEvents` para provar ao TypeScript que cada campo de `row: Record<string, unknown>` tem o tipo esperado pela interface `EdgeDomainEvent`. Nenhuma mudança em `dispatch`, schema, payload, persistência, ordenação ou logs. |

## Erros encontrados

`deno check` apontou 2 erros após remover a diretiva:

1. **TS2322** (linha 53) — `Type 'unknown' is not assignable to type 'string'` no `aggregateId/aggregateType/eventType/tenantId` retornados pelo `.map()`.
2. **TS2769** (linha 58) — `new Date(row.occurred_on)` rejeitado porque `unknown` não casa com nenhum overload de `Date`.

**Causa real:** o select usa o client genérico `createClient<any>(...)`, então o postgrest devolve cada linha como `unknown[]`. A anotação `row: Record<string, unknown>` é correta, mas o `.map(...)` que monta o objeto `EdgeDomainEvent` precisava de narrowing explícito. Não é problema de banco — `occurred_on` é `timestamptz NOT NULL` em `domain_events`.

## Comportamento preservado

- **`dispatch()`** — corpo, colunas (`aggregate_id, aggregate_type, event_type, payload, occurred_on, tenant_id`), `toISOString()`, `tenant_id || null`, tratamento `try/catch` e logs `[DomainEventDispatcher]` — inalterados.
- **`replayEvents()`** — mesma query (`.eq('aggregate_id', ...).order('occurred_on', { ascending: true })`), mesmo `gte('occurred_on', fromDate.toISOString())`, mesmo `throw error`, mesma estrutura de retorno.
- **Helpers de narrowing** — apenas convertem `unknown` no formato exigido pela interface. `asDateInput` retorna `NaN` para valores inválidos, o que produz `new Date(NaN)` ⇒ `Invalid Date`, exatamente o mesmo resultado observável que `new Date(unknown_inválido)` produziria antes (o código original não fazia validação adicional; só passava direto). `asPayload` devolve `{}` para valores não-objeto — o que protege consumers do tipo `Record<string, unknown>` declarado na interface. `asOptionalString` devolve `undefined` para `null`, casando com `tenantId?: string` (antes o código atribuía `null` a um campo opcional `string`, o que ficava errado em runtime e em tipo).

Nenhuma mudança de payload salvo, de evento emitido ou de semântica de ordenação.

## Consumers

```
rg -n "domain-events|EdgeDomainEventDispatcher|EdgeDomainEvent|replayEvents" supabase/functions --type ts -l
→ supabase/functions/_shared/domain-events.ts
```

**Nenhum consumer ativo** em `supabase/functions/`. A classe é exportada mas não invocada por nenhuma edge function hoje (mantida como infra-pronta). Não houve necessidade de validar consumers externos.

## `_shared` zerado

```
rg -n '^\s*(//|/\*)\s*@ts-nocheck\b' supabase/functions/_shared
→ (vazio)
```

✅ **0 diretivas ativas em `supabase/functions/_shared/`** — meta do D12 atingida.

## Gate expandido

`scripts/guard-no-ts-nocheck-tier1.sh` agora protege +1 path:

```
supabase/functions/_shared/domain-events.ts
```

Total protegido: **36 arquivos**. Execução:

```
bash scripts/guard-no-ts-nocheck-tier1.sh
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

## Riscos residuais

- `createClient<any>` segue no construtor — o narrowing é a única linha de defesa de tipo para o retorno do select. Quando `TYPEGEN-SYNC-01` migrar este client para `Database`, os helpers podem ser removidos.
- `asPayload` devolve `{}` se o banco devolver `payload` em formato inesperado. Em runtime isso só acontece se a coluna `jsonb` estiver corrompida — improvável, mas digno de menção.
- Nenhum consumer atual, então o impacto operacional é zero. Quando algum consumer for plugado, validar com `deno check` de borda a borda.

## Próximo alvo

**D13 — Inventário global pós-`_shared`.** Re-executar o scanner D11-A em `supabase/functions/**` (excluindo `_shared/` já zerado), classificar por:

- public edge / service_role
- billing / auth / identity
- AI / automation / admin / report

E definir as ondas de D14 com números reais (não estimativa).
