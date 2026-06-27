# Bloco D15-B3 — Ops Reports — Resultado

## Escopo
Saneamento type-only de funções de geração, listagem, upload de relatórios e coleta de evidências SOC2.

## Alvos saneados (6)
- `supabase/functions/ops-reports/index.ts` — router public (super_admin only).
- `supabase/functions/ops-reports/handlers/report-generators.ts` — compliance / security / explainable.
- `supabase/functions/ops-reports/handlers/report-scheduled.ts` — executive / weekly / auto / scheduled (cron).
- `supabase/functions/list-reports/index.ts` — listagem agent-side (serveAgent + HMAC).
- `supabase/functions/upload-report/index.ts` — upload JSON/multipart (serveAgent + HMAC).
- `supabase/functions/soc2-evidence-collector/index.ts` — coleta de evidências SOC 2.

## Ajustes type-only aplicados
| Arquivo | Linha | Mudança | Motivo |
|---------|------:|---------|--------|
| `report-scheduled.ts` | 580 | `((tenant.subscription_plans as Record<string, unknown>)?.name as string) \|\| "free"` | `name` era `unknown`, não podia indexar `PLAN_FREQUENCIES[planName]` (TS2538). Cast preserva o valor já tratado como string em runtime. |

Nenhuma alteração em: consultas SQL, payloads, formato de relatórios, contratos públicos, paginação, filtros, HMAC, auditoria, service_role ou status HTTP.

## Gates
- `deno check` dos 6 alvos → **PASS**.
- `scripts/guard-no-ts-nocheck-tier1.sh` → **PASS** após inclusão dos 6 alvos.

## Métricas
| Métrica | Antes | Depois |
|---------|------:|------:|
| `@ts-nocheck` ativos em `supabase/functions/` | 57 | **51** |
| Arquivos protegidos pelo gate Tier 1 | 78 | **84** |
| Redução acumulada vs. baseline D13 (96) | −40,6% | **−46,9%** |

## Bugs latentes encontrados
Nenhum. O único erro de tipo detectado pelo `deno check` (TS2538) era de narrowing — em runtime `planName` já operava como string.

## Follow-ups abertos
- Nenhum novo aberto por D15-B3.
- Permanecem em backlog: `FIDO2-PUBKEY-TYPE-01`, `TYPEGEN-SYNC-01`.

## Próxima onda recomendada
**D15-B4 — Automation Runtime** (última parte operacional crítica).
