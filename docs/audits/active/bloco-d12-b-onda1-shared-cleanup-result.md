# Bloco D12-B Onda 1 — `_shared` cleanup result

**Status:** ✅ Concluído
**Escopo:** remoção de `@ts-nocheck` ativo em 3 helpers `_shared` classificados como passantes no inventário D12-A.

## Arquivos alterados

| Item   | Arquivo                                                              | Mudança                                                                              |
| ------ | -------------------------------------------------------------------- | ------------------------------------------------------------------------------------ |
| D12-B1 | `supabase/functions/_shared/ai-evidence-types.ts`                    | Removida diretiva. Substituída por comentário de auditoria. Sem outras mudanças.     |
| D12-B2 | `supabase/functions/_shared/ip-allowlist.ts`                         | Removida diretiva + 2 anotações de tipo mínimas em callbacks (`filter`, `some`).     |
| D12-B3 | `supabase/functions/_shared/submit-handlers/web-activity-helpers.ts` | Removida diretiva + 1 anotação de tipo mínima em `.map(s => s.domain_pattern)`.      |

## Diretivas removidas

3 diretivas `// @ts-nocheck` ativas. Nenhuma alteração de runtime, contrato, payload, normalização, dedupe, parsing de IP/CIDR, regra allow/deny, fallback, logs ou shape de tipos exportados.

## Ajustes type-only justificados (Regra da Onda 1)

Após remover a diretiva, o `deno check` apontou 3x `TS7006` (parâmetro com `any` implícito) — todos em callbacks de array. Resolvidos com anotações estruturais mínimas (`{ ip_address: unknown; expires_at?: string | null }`, `{ domain_pattern: string }`), sem alterar comportamento nem introduzir cast amplo. Nenhuma interface exportada foi tocada.

## Validação `deno check`

```
deno check supabase/functions/_shared/ai-evidence-types.ts                            → OK
deno check supabase/functions/_shared/ip-allowlist.ts                                 → OK
deno check supabase/functions/_shared/submit-handlers/web-activity-helpers.ts         → OK
```

## Consumer validado (B3)

`rg -n "web-activity-helpers"` em `supabase/functions/` → único consumer:

```
supabase/functions/_shared/submit-handlers/web-activity.ts
```

```
deno check supabase/functions/_shared/submit-handlers/web-activity.ts → OK
```

## Runtime preservado

- `categorizeDomain`, `loadBlockedPatterns`, `isDomainBlocked`: lógica e ordem das regras inalteradas.
- `enforceIPAllowlist`: fluxo bypass IPs internas, fail-open em erro de DB, política aberta sem entradas, filtragem por `expires_at`, match direto + CIDR — todos inalterados.
- `ai-evidence-types.ts`: arquivo puro de tipos/helpers — interfaces, enums e helpers (`buildEvidence`, `extractDataSources`, `calculateConfidence`, `generateReasoningSummary`) intactos.

## Gate anti-regressão expandido

`scripts/guard-no-ts-nocheck-tier1.sh` agora cobre +3 paths:

```
supabase/functions/_shared/ai-evidence-types.ts
supabase/functions/_shared/ip-allowlist.ts
supabase/functions/_shared/submit-handlers/web-activity-helpers.ts
```

Total protegido: 31 arquivos. Execução pós-expansão:

```
bash scripts/guard-no-ts-nocheck-tier1.sh
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

## Diretivas `_shared` restantes (5)

```
supabase/functions/_shared/ai-multi-provider.ts
supabase/functions/_shared/dlq.ts
supabase/functions/_shared/domain-events.ts
supabase/functions/_shared/hexagonal/adapters.ts
supabase/functions/_shared/submit-handlers/alert-engine.ts
```

Bate com a previsão do veredito (`5 diretivas ativas restantes em _shared`).

## Próximo alvo

**D12-B4 — `supabase/functions/_shared/submit-handlers/alert-engine.ts`** (S2, passa no `deno check` per D12-A).
