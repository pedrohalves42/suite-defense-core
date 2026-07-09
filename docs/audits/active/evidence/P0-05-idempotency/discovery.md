# P0-05 — Escrita duplicada / Idempotency · Discovery Note (Sprint 0 · Day 3)

- Date: 2026-07-09
- Owner: Reliability Lead
- Mode: read-only inspection
- Depends on: P0-01, P0-04

## Classificação

**Needs Investigation.**

Primitivas de idempotência existem e estão isoladas em
`_shared/reliability/idempotency.ts` (160 linhas), com testes
comportamentais. A cobertura **por endpoint de escrita crítica**
não foi comprovada nesta janela.

## Evidência coletada

### Primitivas

- `supabase/functions/_shared/reliability/idempotency.ts` (160 LOC).
- `supabase/functions/_shared/reliability/__tests__/idempotency.behavior.test.ts`.
- Tabela com coluna `idempotency_key` (nullable) visível em
  `database.types.ts` (linhas 14059/14071/14083).
- RPC com parâmetro `p_idempotency_key` (linha 50354).
- Integração no pipeline de reliability
  (`_shared/reliability/pipeline.ts` referenciando idempotency).

### Gap

- Não foi enumerada a lista de endpoints de escrita crítica
  (jobs, actions, rollback, honeypot, alerts, install events) que
  **exigem** idempotency-key. A primitiva existir não implica
  que todo endpoint mutador a utilize.
- Nenhum grep exaustivo por callers de `withIdempotency` ou nome
  equivalente foi executado (fora de escopo Day 3).

## Sinais numéricos

| Sinal                                                    | Valor |
| -------------------------------------------------------- | ----- |
| Módulos de primitiva idempotency em `_shared/reliability`| 1     |
| Testes comportamentais                                   | 1 arquivo |
| Colunas SQL `idempotency_key`                            | ≥1 tabela |
| RPCs com `p_idempotency_key`                             | ≥1    |
| Cobertura por endpoint crítico comprovada                | não   |

## Guarda de freeze respeitada

- ❌ Nenhuma alteração em `_shared/reliability/*` (freeze crítico).
- ❌ Nenhuma alteração em wrappers, retries, breakers.
- ❌ Nenhum endpoint tocado.
- ✅ Apenas leitura de código, tipos gerados e listagem.

## Próximo passo (fora do Sprint 0)

1. Spike 1d: enumerar endpoints POST/PATCH/DELETE das edge functions
   e classificar em `usa idempotency | não usa | não requer`.
2. Produzir tabela ANTES: cobertura atual.
3. Só então decidir se é `False Positive` (cobertura suficiente),
   `Confirmed` (gaps identificados) ou meta-tarefa de auditoria.

Dependência: P0-04 (idempotency sem AAL2 em endpoint destrutivo
ainda é vulnerável a replay autenticado por atacante com token
roubado).
