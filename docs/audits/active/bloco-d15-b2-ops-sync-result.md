# Bloco D15-B2 — Ops Sync — Resultado

## Escopo
Saneamento type-only de `ops-sync/*` (jobs, DLQ, scheduler/cron, EDR sync).

## Alvos saneados (3)
- `supabase/functions/ops-sync/index.ts` — entrypoint do router.
- `supabase/functions/ops-sync/handlers/sync-jobs.ts` — process-failed-jobs, process-scheduled-jobs, invoke-scheduled-jobs, dlq-action, process-dlq-retries.
- `supabase/functions/ops-sync/handlers/edr-ops.ts` — fetch-nvd-cves, correlate-edr-events, evaluate-edr-detections.

## Ajustes type-only aplicados
| Arquivo | Linha | Mudança | Motivo |
|--------|------|---------|--------|
| `edr-ops.ts` | 169 | `... as string[]` em `allTenantIds = [...new Set([...ruleTenantIds, ...fromEvents])]` | `Set<unknown>` quando concatenado com `string[]` perde narrowing; cast restabelece o contrato pré-existente (já era tratado como `string[]` no `allTenantIds`). |
| `edr-ops.ts` | 225 | `... as string[]` no array de táticas passado a `createIncident(... tactics: string[])` | `.filter(Boolean)` não estreita `unknown[]`; cast preserva a assinatura existente. |

Nenhuma alteração em lógica, fluxo de retries, idempotência, concorrência, política de cron/scheduler, SQL, payloads, HMAC, auditoria, service_role ou status HTTP. Apenas remoção das diretivas `@ts-nocheck` e dois casts de narrowing.

## Gates
- `deno check ops-sync/index.ts ops-sync/handlers/sync-jobs.ts ops-sync/handlers/edr-ops.ts` → **PASS** (limpo).
- `scripts/guard-no-ts-nocheck-tier1.sh` → **PASS** após inclusão dos 3 alvos no gate.

## Métricas
| Métrica | Antes | Depois |
|---------|------:|------:|
| `@ts-nocheck` ativos em `supabase/functions/` | 60 | **57** |
| Arquivos protegidos pelo gate Tier 1 | 75 | **78** |
| Redução acumulada vs. baseline D13 (96) | −37,5% | **−40,6%** |

## Bugs latentes encontrados
Nenhum nesta onda. Os erros TS2322/TS2345 detectados pelo `deno check` eram puramente de narrowing — o runtime já operava com `string[]`.

## Follow-ups abertos
- Nenhum novo aberto por D15-B2.
- Permanecem em backlog os itens previamente catalogados: `API-GATEWAY-DRIFT-01` (parcialmente absorvido em D14-A4), `FIDO2-PUBKEY-TYPE-01`, `TYPEGEN-SYNC-01`.

## Próxima onda recomendada
**D15-B3 — Ops Reports** (mesmo padrão type-only, runtime preservado).
