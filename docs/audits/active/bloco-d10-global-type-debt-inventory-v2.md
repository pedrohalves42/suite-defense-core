# D10 v2 — Global Type Debt Inventory (Scanner Corrigido)

**Bloco:** D11-A
**Tipo:** Read-only / inventário
**Status:** ✅ Concluído
**Substitui parcialmente:** `bloco-d10-global-type-debt-inventory.md` (contagem `@ts-nocheck`)
**Corrige também:** `bloco-d11-pre-regression-root-cause.md` §3 (subcontagem "3 ativas fora de Tier 1")

---

## 1. Causa do retrabalho

O scanner D10 original usava o padrão amplo:

```bash
rg '@ts-nocheck' supabase/functions
```

Esse padrão casa três coisas distintas:

1. Diretiva ativa do TS: `// @ts-nocheck` na primeira coluna.
2. Menção em JSDoc/comentário de auditoria: `* D3: @ts-nocheck removed.`
3. Strings literais em arquivos de documentação (`docs/audits/...`).

Como resultado, o D10 reportou **115 arquivos** e o D11-Pré, sobre-corrigindo, concluiu que só existiriam **3 diretivas ativas fora de Tier 1**. Ambos os números estavam errados.

---

## 2. Scanner corrigido (D11-A)

Regex adotada:

```bash
^\s*(//|/\*)\s*@ts-nocheck\b
```

- `^\s*` — começo de linha (admite indentação).
- `(//|/\*)` — abre comentário de linha ou bloco.
- `\s*@ts-nocheck\b` — diretiva exata, boundary à direita.

Casa:

```ts
// @ts-nocheck
/* @ts-nocheck */
```

Ignora:

```ts
 * D3: @ts-nocheck removed.
 // Histórico: @ts-nocheck foi retirado em D2.
```

---

## 3. Contagem real

### 3.1 Diretivas ativas em `supabase/functions/`

| Métrica                                              | Valor |
| ---------------------------------------------------- | ----: |
| Arquivos com `// @ts-nocheck` ativo                  | **107** |
| Diretivas ativas (1 por arquivo, no topo)            | **107** |
| Arquivos `_shared/` com diretiva ativa               | **8** |
| Arquivos Tier 1 (D2–D9) com diretiva ativa           | **0** ✅ |

### 3.2 Tier 1 — verificação individual

Todos os 13 arquivos críticos tratados em D2–D9 estão **limpos**:

```
supabase/functions/heartbeat/index.ts                       clean
supabase/functions/heartbeat/state-updater.ts               clean
supabase/functions/poll-jobs/index.ts                       clean
supabase/functions/ack-job/index.ts                         clean
supabase/functions/submit-router/index.ts                   clean
supabase/functions/submit-job-result/index.ts               clean
supabase/functions/register-agent-key/index.ts              clean
supabase/functions/public-gateway/index.ts                  clean
supabase/functions/_shared/serve-agent.ts                   clean
supabase/functions/_shared/agent-auth.ts                    clean
supabase/functions/_shared/hmac.ts                          clean
supabase/functions/_shared/hmac-success-coalescer.ts        clean
supabase/functions/_shared/error-handler.ts                 clean
```

**Confirmado: não houve regressão em Tier 1.**

### 3.3 `_shared/` com diretiva ativa (não-Tier 1)

```
supabase/functions/_shared/ai-evidence-types.ts
supabase/functions/_shared/ai-multi-provider.ts
supabase/functions/_shared/dlq.ts
supabase/functions/_shared/domain-events.ts
supabase/functions/_shared/hexagonal/adapters.ts
supabase/functions/_shared/ip-allowlist.ts
supabase/functions/_shared/submit-handlers/alert-engine.ts
supabase/functions/_shared/submit-handlers/web-activity-helpers.ts
```

São 8 arquivos — não 3 como afirmado em D11-Pré. A subcontagem original do D11-Pré
("3 diretivas ativas fora de Tier 1") referia-se a uma amostra arbitrária citada
no relatório (`fingerprint-utils.ts`, `software-risk.ts`, `fido2-auth.ts`) e não a
um total. Esta nota corrige o registro.

### 3.4 Menções textuais/documentais

| Origem                                            | Ocorrências |
| ------------------------------------------------- | ----------: |
| Total bruto (`@ts-nocheck` em `supabase/functions` + `docs`) | 266 |
| Diretivas ativas (linhas reais)                   | 107 |
| Menções em JSDoc / comentários / docs de auditoria | **159** |

As 159 menções restantes são histórico documental (relatórios D0–D11, runbooks)
e **não constituem dívida técnica**. Não devem aparecer nas próximas contagens
de débito.

---

## 4. Reclassificação dos achados D10

| Achado D10 original                                | Status v2 |
| -------------------------------------------------- | --------- |
| "115 arquivos com `@ts-nocheck`"                   | ❌ Falso positivo (incluía JSDoc). Real: **107 ativos**. |
| "9 arquivos `_shared/` com `@ts-nocheck`"          | ⚠️ Quase: **8 ativos** em `_shared/`. |
| "Regressão em 10 arquivos Tier 1"                  | ❌ Falso positivo. Tier 1 está **100% limpo**. |
| "10 erros `deno check` em 5 funções Tier 1"        | ✅ Permanece válido — investigar em D11-B/D11-C. |
| "agents.version ausente em database.types.ts"      | ✅ Permanece válido — alvo do D11-B. |
| "759 tokens `any`, 150 `as any`"                   | ✅ Permanece válido — fora do escopo D11-A. |

---

## 5. Métrica oficial pós-D11-A

| Métrica                                                | Esperado | Real | Status |
| ------------------------------------------------------ | -------: | ---: | :----: |
| `@ts-nocheck` ativo em Tier 1 tratado                  |        0 |    0 |   ✅   |
| `@ts-nocheck` ativo total em `supabase/functions`      |    ~100 |  107 |   ✅   |
| Helpers `_shared/` críticos (Tier 1) com erro          |        0 |    0 |   ✅   |
| Regressão em arquivos D2–D9                            |  não houve | não houve | ✅ |
| Falso positivo D10 documentado                         |      sim |  sim |   ✅   |

---

## 6. Recomendações

1. **Adotar a regex corrigida** como padrão único de contagem em todos os
   próximos inventários e no gate de CI (D11-E).
2. **Substituir o D10 v1** como fonte autoritativa pelas contagens deste
   documento até a próxima varredura.
3. **Liberar D11-B (regen typegen)** — o type drift em `agents.version`
   permanece confirmado e bloqueia a tipagem real de `heartbeat/state-updater.ts`.
4. **Não tocar agora** nas 107 diretivas ativas; serão alvo de waves posteriores
   (D12+), priorizadas por blast radius (auth/heartbeat/submit > ai-* / ops-*).

---

## 7. O que foi proibido em D11-A (e respeitado)

- ❌ Regenerar `database.types.ts`
- ❌ Corrigir `state-updater.ts`
- ❌ Remover qualquer diretiva ativa
- ❌ Alterar runtime/migrations

D11-A foi 100% scanner/inventário/documentação. Nenhum arquivo de runtime
foi modificado.

---

## 8. Próximo passo

**D11-B — Regenerar `database.types.ts`** em PR separada, com validação:

```bash
rg -n "version|last_heartbeat" supabase/functions/_shared/database.types.ts
deno check supabase/functions/heartbeat/state-updater.ts
deno check supabase/functions/heartbeat/index.ts
```
