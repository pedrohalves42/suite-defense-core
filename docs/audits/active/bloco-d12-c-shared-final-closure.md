# D12-C — Fechamento final de `_shared`

**Status:** ✅ Concluído (read-only / documental)
**Data:** 2026-06-26
**Escopo:** registro formal do fechamento do D12. Nenhuma alteração de runtime, contrato ou código de produção.

---

## 1. Objetivo

Documentar oficialmente que o diretório `supabase/functions/_shared/**` está saneado:

- 0 diretivas `@ts-nocheck` ativas
- `deno check` validado nos helpers tocados durante D12
- gate anti-regressão protegendo 36 arquivos saneados

Este documento serve de **baseline** para o próximo trilho (D13 — inventário global pós-`_shared`).

---

## 2. Resultado final

| Métrica | Valor |
| --- | --- |
| Diretivas `@ts-nocheck` ativas em `_shared/` | **0** |
| Total de arquivos `.ts` em `_shared/` (incluindo subpastas) | 181 |
| Arquivos adicionados ao gate no D12-B | 8 (B1–B8) |
| Gate atual (`scripts/guard-no-ts-nocheck-tier1.sh`) | **36 arquivos protegidos** |
| Runtime alterado | ❌ Não |
| Contratos alterados | ❌ Não |
| Payload/schema alterado | ❌ Não |

---

## 3. Arquivos limpos durante o D12

Onda 1 — zero-risk (B1–B3):
- `supabase/functions/_shared/ai-evidence-types.ts`
- `supabase/functions/_shared/ip-allowlist.ts`
- `supabase/functions/_shared/submit-handlers/web-activity-helpers.ts`

Onda 2 — operacional (B4–B6):
- `supabase/functions/_shared/submit-handlers/alert-engine.ts`
- `supabase/functions/_shared/dlq.ts`
- `supabase/functions/_shared/hexagonal/adapters.ts`

Onda 3 — fix type-only (B7–B8):
- `supabase/functions/_shared/ai-multi-provider.ts`
- `supabase/functions/_shared/domain-events.ts`

Cada bloco tem relatório individual em `docs/audits/active/bloco-d12-b{1..8}-*-result.md`.

---

## 4. Checks executados

### 4.1 Scanner de diretivas ativas

```bash
rg -n '^\s*(//|/\*)\s*@ts-nocheck\b' supabase/functions/_shared
```

Resultado: **0 ocorrências** ✅

### 4.2 Gate anti-regressão

```bash
bash scripts/guard-no-ts-nocheck-tier1.sh
```

Resultado:

```
PASS: no active @ts-nocheck in protected Tier 1 / type-clean files.
EXIT=0
```

### 4.3 Inventário

```bash
find supabase/functions/_shared -name "*.ts" | wc -l
→ 181
```

Todos os 181 arquivos `.ts` sob `_shared/` (raiz + subpastas como `hexagonal/`, `submit-handlers/`, etc.) estão sem diretiva `@ts-nocheck` ativa.

---

## 5. Riscos residuais

- **~96 diretivas `@ts-nocheck` ativas fora de `_shared/`** — número estimado em D10 v2; valor exato será confirmado em **D13**.
- **Gate parcial** — `scripts/guard-no-ts-nocheck-tier1.sh` cobre 36 arquivos saneados, não o repositório inteiro. Arquivos fora dessa lista podem regredir sem disparar CI.
- **Typegen ainda manual** — `database.types.ts` foi regenerado em D11-B, mas a sincronização não está automatizada (backlog: `TYPEGEN-SYNC-01`).
- **`createClient<any>` em `domain-events.ts`** — o narrowing type-only adicionado em D12-B8 é a única linha de defesa de tipo no `replayEvents`. Quando `TYPEGEN-SYNC-01` migrar o client para `Database`, os helpers podem ser removidos.
- **Hardening funcional pendente** — CLEAN-01 (PII + RLS), `SAML-HARDEN-01`, `SCIM-HARDEN-01`, `COALESCER-HARDEN-01`, `PERF-01` permanecem no backlog e não foram tocados no D12.
- **Coalescer HMAC (PP02-A/B)** — encerrado como Inconclusivo; hipótese de redução de upserts segue não comprovada por falta de tráfego real.

---

## 6. Próximo bloco

**D13 — Inventário global pós-`_shared`.**

Deve responder com números reais (não estimativa):

- quantos `@ts-nocheck` ativos restam fora de `_shared/`
- quantos em `public-gateway/` (public edge)
- quantos usam `service_role`
- quantos pertencem a billing / auth / identity
- quantos pertencem a AI / automation / admin / report
- qual a próxima onda recomendada por risco

D13 é read-only/inventário. Nenhuma remoção de diretiva será feita até a classificação estar pronta.

---

## 7. Marco

`supabase/functions/_shared/**` agora é **type-clean**. Qualquer regressão é bloqueada pelo gate de CI. Este é o baseline oficial para o restante do trilho D13 → D14 → D15.
