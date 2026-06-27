# Program Status — Pós D15 / Pré D16

**Data:** 2026-06-27
**Escopo:** Fechamento da camada Ops Platform + Automation Runtime.

---

## 1. Blocos concluídos (acumulado)

| Bloco                | Estado |
| -------------------- | ------ |
| D1–D9 (Agent core)   | ✅ |
| D10–D12 (`_shared/`) | ✅ |
| D13 (inventário)     | ✅ |
| D14-A1 Billing       | ✅ |
| D14-A2 Auth/Identity | ✅ |
| D14-A3 Anti-abuse    | ✅ |
| D14-A4 Release/Signing | ✅ |
| D15-B1 Ops Gateway/Playbook | ✅ |
| D15-B2 Ops Sync      | ✅ |
| D15-B3 Ops Reports   | ✅ |
| **D15-B4 Automation Runtime** | ✅ |
| **HF-AUTOMATION-02** (LATENT-AUTOMATION-02 promovido) | ✅ |

---

## 2. Métricas atualizadas

| Métrica | Inicial | Pós D15-B1 | Pós D15-B4 | **Pós HF-AUTOMATION-02** |
| --- | --- | --- | --- | --- |
| `@ts-nocheck` ativos em `supabase/functions/` (diretiva real) | ~122 | 60 | 55 | **40** ¹ |
| Arquivos no gate Tier 1 | 0 | 75 | 100 | **100** |
| `_shared/` type-clean | ❌ | ✅ | ✅ | ✅ |
| Redução acumulada de dívida | — | ~51% | ~55% | **~67%** |

¹ Recontagem rigorosa via `^// @ts-nocheck` (ignorando comentários históricos
   "@ts-nocheck removed"). Os 55 reportados em D15-B4 incluíam 15 falsos
   positivos em comentários de auditoria; nenhum drift real.

---

## 3. Findings desta janela

### FUP-SHARED-DRIFT-01 — **FALSO POSITIVO** ❎

Re-inventário com filtro estrito (`^// @ts-nocheck` em vez de substring):
- 0 diretivas ativas em `_shared/`.
- 8 arquivos contêm a string mas em comentários do tipo
  `D12-Bx: @ts-nocheck removed`, que são marcadores de auditoria, não
  diretivas. `deno check` em `_shared/` permanece PASS.

Conclusão: nenhuma regressão. Encerrado sem patch.

### LATENT-AUTOMATION-02 — **Runtime bug** → HF-AUTOMATION-02 ✅

**Classificação:** Runtime bug crítico (Postgres 42703 latente).

`autonomous-safe-mode/index.ts` selecionava
`name, severity, conditions, actions` em `decision_rules`. Schema real
(`_shared/database.types.ts`):
`auto_execute, code, created_at, definition (jsonb), description, id,
is_enabled, scope, updated_at`.

Qualquer execução com `is_enabled=true` levantaria `column "name" does not
exist`, abortando o engine inteiro antes de qualquer handler rodar. Não era
type-only — era runtime fatal mascarado pelo `@ts-nocheck` anterior.

**Fix HF-AUTOMATION-02 (escopo estrito):** corrigir só o `.select()` para as
colunas reais (`id, code, description, is_enabled, definition, auto_execute,
scope`). Handlers já consumiam `rule.code` + `rule.definition.{conditions,
parameters}` conforme tipado em `types.ts` — zero mudança de runtime nos
processors. `deno check autonomous-safe-mode/index.ts` PASS.

### LATENT-AUTOMATION-01 / -03 — backlog

- **-01** (`approved_by` removido em D15-B4): já fechado no bloco.
- **-03** (`payload_hash` ausente em insert de jobs): logic/contract bug.
  Não é runtime fatal; idempotência de jobs ainda funciona via outras chaves.
  Promover para hotfix isolado **depois** de D16 (não bloqueia AI handlers).

---

## 4. Riscos residuais

- 40 diretivas `@ts-nocheck` restantes — concentradas em AI handlers (D16) e
  pipelines de build/release/agent script (D17).
- Audit hashing chain rotation — backlog Q3.
- `TYPEGEN-SYNC-01` — automação de regeneração de `database.types.ts` ainda
  proposta, sem implementação.
- Domain gates segmentados — proposto, sem implementação.

---

## 5. Próximo bloco

**D16 — AI Handlers** liberado. Alvos sugeridos (Tier C, baixo risco runtime):

```
ai-router/*, ai-agent-assist, ai-analyze-agent, ai-system-analyzer/*,
ai-system-audit/*, ai-quality-check/*, ai-red-team-assessment,
ai-predict-agent-failure, ai-insight-dispatcher, ai-full-audit,
ai-action-executor, action-center-feed, collect-router
```

Estimativa: ~20 arquivos. Critérios de sempre — type-only, runtime
preservado, `deno check` limpo, gate expandido, relatório de fechamento.
