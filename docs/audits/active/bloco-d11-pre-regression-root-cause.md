# D11-Pré — Root Cause da Regressão de `@ts-nocheck`

> **Status:** READ-ONLY. Nenhum arquivo de código foi modificado.
> **Janela:** 2026-06-25
> **Origem da suspeita:** Inventário D10 reportou 10 arquivos de Tier 1
> com `@ts-nocheck` reintroduzido após terem sido limpos em D2–D9.

---

## 1. Objetivo

Investigar, de forma estritamente read-only, se a aparente regressão de
`@ts-nocheck` nos arquivos de Tier 1 representa:

- **(a)** uma reintrodução real da diretiva (merge ruim, rebase, branch
  antiga, conflito mal resolvido, recolocação manual, path duplicado), **ou**
- **(b)** um **falso positivo** do scanner D10 (match em comentário de
  documentação, e não em diretiva ativa).

Adicionalmente: investigar o erro `TS2344` reportado em
`heartbeat/state-updater.ts` envolvendo `version` / `last_heartbeat`
e decidir se é **type drift** ou **bug real mascarado**.

---

## 2. Arquivos investigados

Lista derivada do relatório D10 (Tier 1, regressões alegadas):

| # | Arquivo |
|---|---------|
| 1 | `supabase/functions/heartbeat/index.ts` |
| 2 | `supabase/functions/heartbeat/state-updater.ts` |
| 3 | `supabase/functions/poll-jobs/index.ts` |
| 4 | `supabase/functions/ack-job/index.ts` |
| 5 | `supabase/functions/submit-router/index.ts` |
| 6 | `supabase/functions/submit-job-result/index.ts` |
| 7 | `supabase/functions/register-agent-key/index.ts` |
| 8 | `supabase/functions/public-gateway/index.ts` |
| 9 | `supabase/functions/public-gateway/handlers/*` |
| 10 | `supabase/functions/_shared/serve-agent.ts` |

---

## 3. Arquivos que voltaram com `@ts-nocheck`

### 3.1 Varredura literal (`rg "@ts-nocheck"`)

```
supabase/functions/_shared/serve-agent.ts:5
    * D9-X1: removed @ts-nocheck. ...
supabase/functions/ack-job/index.ts:5
    * D7: removed @ts-nocheck. ...
supabase/functions/poll-jobs/index.ts:5
    * D6: removed @ts-nocheck. ...
supabase/functions/register-agent-key/index.ts:6
    * D8-A: removed @ts-nocheck. ...
supabase/functions/heartbeat/index.ts:16
    * D3 (Bloco D — type safety): @ts-nocheck removed. ...
supabase/functions/submit-router/index.ts:6
    * D5: Removed @ts-nocheck. ...
supabase/functions/submit-job-result/index.ts:13
    * D4 (Bloco D): `@ts-nocheck` removed. ...
supabase/functions/register-agent-key/fingerprint-utils.ts:1
    // @ts-nocheck                            ← DIRETIVA ATIVA (sub-módulo, não Tier 1)
supabase/functions/public-gateway/handlers/software-risk.ts:1
    // @ts-nocheck                            ← DIRETIVA ATIVA (handler, não Tier 1)
supabase/functions/public-gateway/handlers/fido2-auth.ts:1
    // @ts-nocheck                            ← DIRETIVA ATIVA (handler, não Tier 1)
```

### 3.2 Tabela de classificação

| arquivo | linha | conteúdo | tipo | regressão? |
|---|---|---|---|---|
| `_shared/serve-agent.ts` | 5 | comentário JSDoc "`removed @ts-nocheck`" | doc | **NÃO** |
| `ack-job/index.ts` | 5 | comentário JSDoc | doc | **NÃO** |
| `poll-jobs/index.ts` | 5 | comentário JSDoc | doc | **NÃO** |
| `register-agent-key/index.ts` | 6 | comentário JSDoc | doc | **NÃO** |
| `heartbeat/index.ts` | 16 | comentário JSDoc | doc | **NÃO** |
| `heartbeat/state-updater.ts` | — | **nenhuma menção** | — | **NÃO** |
| `submit-router/index.ts` | 6 | comentário JSDoc | doc | **NÃO** |
| `submit-job-result/index.ts` | 13 | comentário JSDoc | doc | **NÃO** |
| `public-gateway/index.ts` | — | **nenhuma menção** | — | **NÃO** |
| `register-agent-key/fingerprint-utils.ts` | 1 | `// @ts-nocheck` ativo | diretiva | **fora de Tier 1** |
| `public-gateway/handlers/software-risk.ts` | 1 | `// @ts-nocheck` ativo | diretiva | **fora de Tier 1** |
| `public-gateway/handlers/fido2-auth.ts` | 1 | `// @ts-nocheck` ativo | diretiva | **fora de Tier 1** |

### 3.3 Conclusão da seção

**Nenhum dos 10 arquivos de Tier 1 contém `@ts-nocheck` ativo.**
Todas as ocorrências encontradas são strings dentro de **comentários
de documentação** que registram a remoção feita em D2–D9
(ex.: `* D3: @ts-nocheck removed. Runtime is unchanged`).

As 3 ocorrências de diretiva **ativa** estão em sub-módulos/handlers
que **nunca foram alvo de D2–D9** e portanto **não constituem
regressão** — são débito pré-existente fora do escopo Tier 1.

---

## 4. Commits suspeitos

**Não aplicável.** Como não há regressão real, `git log`/`git blame`
sobre `@ts-nocheck` nesses arquivos não produziriam evidência útil
(apenas o commit original de D2–D9 que adicionou o comentário de
documentação contendo a string "removed @ts-nocheck").

---

## 5. Causa raiz provável

| Hipótese | Veredito |
|---|---|
| merge/rebase ruim | **DESCARTADA** |
| branch antiga aplicada por cima | **DESCARTADA** |
| conflito resolvido errado | **DESCARTADA** |
| recolocação manual de `@ts-nocheck` | **DESCARTADA** |
| arquivo duplicado / path diferente | **DESCARTADA** |
| **falso positivo do scanner D10** | **CONFIRMADA** |

**Causa raiz:** o inventário D10 usou contagem ingênua da substring
`@ts-nocheck` sem filtrar por:
- estar em coluna 1 da linha,
- estar em comentário de linha (`//`) ou bloco JSDoc (`*`),
- ser uma diretiva reconhecida pelo TypeScript (primeira linha não-comentário ou
  trigger pragma no topo do arquivo).

A regex correta para diretiva ativa é algo como
`^\s*//\s*@ts-nocheck` ou `^\s*/\*\s*@ts-nocheck` — não
um `rg "@ts-nocheck"` cru.

---

## 6. Análise especial: `heartbeat/state-updater.ts` (TS2344)

### 6.1 Erros reais reportados por `deno check`

```
TS2344  Type '"version" | "last_heartbeat"' does not satisfy the constraint
        '"tenant_id" | "id" | "agent_name" | ... | "web_activity_consent_enabled"'
TS2352  SelectQueryError<"column 'version' does not exist on 'agents'.">
TS2352  (idem, segunda ocorrência)
TS2365  Operator '+' cannot be applied to types 'unknown' and '1'
TS2589  Type instantiation is excessively deep and possibly infinite
TS2769  No overload matches this call (agent_processes.insert — ProcessSample[] vs Json[])
```

Os 4 primeiros erros (TS2344, TS2352×2, TS2365) têm **uma única raiz**:
o tipo da tabela `agents` no `database.types.ts` **não contém a coluna `version`**.

### 6.2 A coluna `version` existe no banco?

| Fonte | Tem `version`? | Evidência |
|---|---|---|
| Migração `20260508235655_…` (RPC `update_agent_state_atomic`) | **SIM** | `SELECT last_heartbeat, version INTO ...`, `version = COALESCE(v_current_version, 0) + 1`, `UPDATE public.agents SET version = 1 WHERE version IS NULL` |
| Código `state-updater.ts` | **SIM** | `.select('version, last_heartbeat')`, `.eq('version', currentVersion)`, `updatePayload.version = currentVersion + 1` (Optimistic Lock) |
| `supabase/functions/_shared/database.types.ts` → `Tables.agents.Row` | **NÃO** | grep no bloco `agents:` retorna `last_heartbeat` mas **nenhuma** entrada `version` |

### 6.3 A coluna `last_heartbeat` existe?

| Fonte | Tem `last_heartbeat`? |
|---|---|
| Banco / migrações | **SIM** |
| Código | **SIM** |
| `database.types.ts` (`Tables.agents`) | **SIM** (linha 7110 do bloco agents: `last_heartbeat: string | null`) |

### 6.4 Conclusão

**Type drift confirmado.** A coluna `agents.version` (INT, usada para
Optimistic Locking) **existe no schema real**, é manipulada pela RPC
`update_agent_state_atomic` e pelo código aplicacional, mas **está
ausente do `database.types.ts` gerado**.

- **Não é bug real.** O código está correto. O Optimistic Lock funciona
  em produção (Pc-Yasmin voltou a 200 OK em PP02-B após HOTFIX-AUTH-02).
- **Não é mascaramento por `@ts-nocheck`.** O arquivo já está sem
  diretiva desde D2. Os erros existem agora porque a verificação está
  ativa, e o tipo gerado está desatualizado.
- TS2769 (insert em `agent_processes`) é um problema **separado**:
  `ProcessSample[]` não satisfaz a constraint `Json[]` (falta index
  signature). É type-only, sem impacto em runtime.

---

## 7. Decisão recomendada para D11

Como **não há regressão real**, a ordem original do plano muda:

| PR | Escopo | Prioridade |
|---|---|---|
| **D11-A** | Corrigir o **scanner D10** para distinguir diretiva ativa (`^\s*//\s*@ts-nocheck`) de comentário documental, e republicar o inventário. | **Alta** — evita pânico futuro e desbloqueia confiança no painel de débito. |
| **D11-B** | Regenerar `database.types.ts` (typegen) para incluir as colunas `agents.version` (e qualquer outra coluna persistida pela RPC `update_agent_state_atomic` que esteja ausente do tipo). Após regen, os 4 erros (TS2344, TS2352×2, TS2365) em `state-updater.ts` desaparecem sem tocar no código. | **Alta** — único caminho seguro; mexer em `state-updater` "à mão" arrisca quebrar o Optimistic Lock. |
| **D11-C** | Resolver o TS2769 em `state-updater.ts` (linha 365, `agent_processes.insert`) adicionando index signature em `ProcessSample` **ou** um cast `as unknown as Json[]` no payload. Mudança type-only. | Média |
| **D11-D** | Limpar as 3 diretivas `@ts-nocheck` ativas remanescentes em sub-módulos fora de Tier 1: `register-agent-key/fingerprint-utils.ts`, `public-gateway/handlers/software-risk.ts`, `public-gateway/handlers/fido2-auth.ts`. | Média |
| **D11-E** | Gate anti-regressão em CI (`.github/workflows/`) que falhe build se `^\s*//\s*@ts-nocheck` aparecer em qualquer arquivo de Tier 1. | Média |

> **Não reverter nenhum commit.** Não há commit a reverter — a "regressão" não aconteceu.

---

## 8. Riscos residuais

1. **Outros arquivos do inventário D10 podem estar igualmente
   marcados como falso positivo.** Recomenda-se rodar a varredura
   corrigida (`^\s*//\s*@ts-nocheck`) globalmente antes de planejar
   D12+. A contagem real de débito é provavelmente menor que os 115
   arquivos reportados.

2. **Type drift de `database.types.ts` pode esconder outros casos
   além de `agents.version`.** Recomenda-se uma diff entre o schema
   real (introspect via `pg_dump` ou snapshot da RPC) e o tipo gerado
   antes do D11-B, para capturar todas as colunas órfãs de uma vez.

3. **TS2589 ("instantiation excessively deep") em `state-updater.ts`**
   pode ressurgir ao regenerar tipos se `agents` tiver muitas relações
   FK encadeadas. Caso ocorra, mitigar com um tipo local explícito
   (`type AgentRow = Database['public']['Tables']['agents']['Row']`) em
   vez de inferência implícita — também type-only.

4. **Os 3 `@ts-nocheck` ativos em handlers do `public-gateway` e
   `register-agent-key`** representam débito pré-existente real, mas
   estão fora do escopo Tier 1 e não contaminam a janela atual.

---

## Apêndice A — Comandos read-only executados

```bash
rg -n "@ts-nocheck" supabase/functions/{heartbeat,poll-jobs,ack-job,submit-router,submit-job-result,register-agent-key,public-gateway} supabase/functions/_shared/serve-agent.ts

rg -n "version|last_heartbeat" supabase/functions/heartbeat/state-updater.ts
rg -n "agents.*version|last_heartbeat" supabase/functions/_shared/database.types.ts
rg -n "agents\b.*version|version.*agents" supabase/migrations

cd supabase/functions && deno check heartbeat/state-updater.ts
```

Nenhum comando `git log`/`git blame` foi necessário: a análise estática
deixou claro que não houve reintrodução real da diretiva, tornando a
investigação de autoria irrelevante.

---

**Critério de saída atendido:**

- [x] Identificado quem "reintroduziu" `@ts-nocheck`: **ninguém — falso positivo do scanner D10.**
- [x] Quando: **não houve reintrodução.**
- [x] Por quê: **regex do scanner D10 captura strings em comentários.**
- [x] Reverter com segurança: **N/A.**
- [x] `state-updater.ts` é type drift ou bug real: **type drift.** O código está correto; o `database.types.ts` está desatualizado para a coluna `agents.version`.
