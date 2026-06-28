# D19-B — Type Escape Inventory & Classification

**Status:** Concluído
**Escopo:** Inventário, classificação por categoria, remoção apenas de escapes desnecessários, documentação de boundaries legítimos e nova política de governança.

---

## 1. Inventário consolidado (produção; testes e gerados excluídos)

| Escape | Antes D19-B | Depois D19-B | Δ |
| --- | ---: | ---: | ---: |
| `@ts-nocheck` | 0 | 0 | 0 |
| `@ts-ignore` | 0 | 0 | 0 |
| `@ts-expect-error` | 2 | 2 | 0 |
| `as any` | 167 | 167 | 0 |
| `as unknown as` | 206 | 206 | 0 |
| `as never` | 34 | **30** | **-4** |
| **Type Escape Index** (10/4/3/2/1) | **1346** | **1338** | -8 |

Remoções aplicadas em D19-B: 4× `as never` stale em `check_global_circuit_breaker` (RPC presente no typegen após D18-2; mesmo padrão diagnosticado em D19-A).

> Contagem anterior de 136 `as any` (reportada no checkpoint pós-D18-3) inclui apenas `src/`. O inventário desta onda cobre `src/ + supabase/functions/` (exceto testes e gerados) — total real **167**.

---

## 2. Classificação por categoria

### 2.1 `as any` (167)

| Categoria | Qtd | Exemplos representativos | Veredito |
| --- | ---: | --- | --- |
| **Boundary I/O — JSON do agente** | ~32 | `submit-job-result/side-effects/network-info.ts` (9), `submit-job-result/execution.ts` (3), `evaluate-automation-rules` parsers | **Manter** — payload heterogêneo de agentes Windows/Linux. Justificável. |
| **Modelo de domínio inadequado — bypass do repositório** | ~50 | `ops-checks/use-cases/*` (`(this.checkRepository as any).supabase.from(...)`), `health-monitor.use-case.ts` (13), `calculate-behavioral-baselines.use-case.ts` (8) | **Refatorar** — casos onde a use-case acessa o cliente cru porque a interface do repositório não expõe o método. Plano: D20-A. |
| **Limitação do TS — query builder dinâmico** | ~18 | `check.repository.ts` (10 — `findExistingAlert`, `findExistingInsight`, `getCount`), `ops-gateway/handlers/edr-ops.ts` (4), `ops-sync/handlers/edr-ops.ts` (4) | **Manter com narrowing helper** — mesmo padrão de D19-A; aceitável quando o key é validado em runtime. |
| **Limitação de SDK — RPC com retorno não tipado** | ~15 | `cron-sentinel.use-case.ts`, `analyze-job-failure-patterns.use-case.ts` | **Manter** — `data as any[]` no retorno de RPCs que devolvem `SETOF jsonb`. |
| **Conveniência / Escape desnecessário** | ~30 | `... as any).insert(...)`, `severity: 'medium' as any`, literais de status | **Remover gradualmente** — alvos para D20-A. |
| **Testes/mocks (fora deste inventário)** | 27 | `useSuperAdmin.test.tsx`, `useAuth.test.tsx` | Boundary de teste — **aceito**. |

### 2.2 `as unknown as` (206)

| Categoria | Qtd | Exemplos | Veredito |
| --- | ---: | --- | --- |
| **Boundary estrutural Json ↔ DTO** | ~165 | `auto-remediate/index.ts` (7), `execute-playbook-action/index.ts` (8), `evaluate-playbook-triggers/index.ts` (3), `_shared/json.ts` (3 — centralizado) | **Aceito** — invariância `Record<string, unknown>` vs `Json` do Supabase. **Padrão recomendado: rotear via `asJson()`/`toRecord()` de `_shared/json.ts`** para concentrar a fronteira. |
| **DTO inline em hooks (front-end)** | ~35 | `useEdrTelemetry.ts` (5), `useDashboardQueries.ts` (3), `useBlastRadius.tsx` (3), `useHoneypotData.ts` (3) | **Aceito temporariamente** — retornos de Supabase para tipos nominais de UI. Migrar para `zod` parsers em onda futura. |
| **PDF/export builders** | ~6 | `exportCompliancePdf.ts`, `DashboardPDFReport.tsx` | **Aceito** — bindings de bibliotecas (jspdf) sem tipos completos. |

### 2.3 `as never` (34 → 30)

| Categoria | Qtd | Localização | Veredito |
| --- | ---: | --- | --- |
| **Drift stale — RPC já tipada** | 4 → **0** | `check_global_circuit_breaker` em `auto-remediate` (2), `api-gateway/handlers/security-threats.ts` (1), `create-reinstall-jobs` ❌ não aplicável | ✅ **Removido nesta onda.** |
| **Drift real — RPC NÃO existe no banco** ⚠️ | 6 | `check_blast_radius` em `auto-remediate/index.ts` (2), `api-gateway/handlers/security-threats.ts` (1), `create-reinstall-jobs/index.ts` (2), `ai-router/handlers/execute-solution.ts` (0 — `jobInsertMany`) | **🐛 Flag LATENT-RPC-MISSING-01** — `as never` está mascarando RPC inexistente. Confirmado via `pg_proc`: `check_blast_radius` e `get_runbook_by_type` **não existem em nenhum schema**. Bloco de "Blast Radius Check" cai sempre no `catch` → fail-closed (HTTP 503). Funcionalidade silenciosamente quebrada. |
| **Limitação SDK — upsert sem conflict target tipado** | 11 | `scim-provisioning/user-handlers.ts` (6), `group-handlers.ts` (3), `ai-full-audit/index.ts` (2) | **Aceito** — Supabase Insert types não expõem composite-key `onConflict`. SCIM funciona; mexer é risco alto. |
| **Insert via helper `jobInsertMany`** | 4 | `ai-router/handlers/execute-solution.ts` (2), `create-reinstall-jobs/index.ts` (1), `auto-remediate` (1 — `jobInsert`) | **Manter** — `jobInsertMany()` retorna tipo construído manualmente para preservar invariante de `payload_hash` (HF-JOBS-PAYLOAD-HASH-01). Boundary estrutural. |
| **Release pipeline** | 4 | `register-agent-release/index.ts`, `sign-release/index.ts`, `upload-release-content/index.ts`, `post-installation-telemetry/index.ts` | **Aceito temporariamente** — bindings com `agent_releases` que dependem de colunas geradas em runtime. Avaliar em D20-B. |
| **AI handlers** | 5 | `ai-action-executor`, `ai-system-analyzer`, `ai-system-audit`, `ai-router/execute-solution` (`result: result as never`) | **Manter** — payload polimórfico de saídas de modelos. |

### 2.4 `@ts-expect-error` (2)

| Local | Motivo | Veredito |
| --- | --- | --- |
| `src/components/dashboard/VirtualizedList.tsx:2` | `react-window` v2 vs `@types/react-window` desalinhado | **Aceito** — limitação de biblioteca, com comentário. |
| `src/components/auth/useLoginFlow.ts:93` | `window.turnstile` global injetado por script externo | **Aceito** — boundary externo. |

---

## 3. Resposta direta aos critérios de aprovação

| Pergunta | Resposta |
| --- | --- |
| `as any` por categoria | 32 I/O, 50 modelo de domínio, 18 TS, 15 SDK, 30 conveniência, 22 misc/edge |
| `as unknown as` por categoria | 165 Json↔DTO, 35 hooks de UI, 6 PDF/lib bindings |
| `as never` por categoria | 6 drift real (bug latente), 11 SDK upsert, 4 jobInsert helper, 4 release, 5 AI handlers |
| Removidos imediatamente | 4× `as never` stale em `check_global_circuit_breaker` |
| Aceitáveis como boundary | ~32 (`any`), ~206 (`unknown as`), ~24 (`never`) |
| Dependem de evolução SDK/typegen | ~18 `any` (query builder), 11 `never` (upsert composite key) |
| **Eliminação imediata adicional possível** | ~30 `as any` de conveniência — candidato a **D20-A** |
| **Bugs descobertos pela auditoria** | 1 — **LATENT-RPC-MISSING-01** |

---

## 4. 🐛 LATENT-RPC-MISSING-01 (descoberta crítica)

**Severidade:** Alta — funcionalidade fail-closed silenciosa.

**Evidência:**
```sql
SELECT proname FROM pg_proc p JOIN pg_namespace n ON n.oid=p.pronamespace
WHERE proname IN ('check_blast_radius','get_runbook_by_type','check_global_circuit_breaker');
-- → apenas check_global_circuit_breaker existe
```

**Impacto:**
- `auto-remediate/index.ts` linhas 88-92: chamada lança erro, capturada pelo `catch` em 118-125 → todas as remediações retornam `503 BLAST_RADIUS_UNAVAILABLE`.
- `api-gateway/handlers/security-threats.ts` linha 163: idem.
- `create-reinstall-jobs/index.ts` linha 64: idem.
- `cron-sentinel.use-case.ts` linha 38: `get_runbook_by_type` retorna `null` silenciosamente; runbook nunca é resolvido.

**Por que `as never` mascarou:** o cast desativa a checagem do nome de RPC contra `Database['public']['Functions']`, permitindo que o typecheck passe com um nome inexistente.

**Encaminhamento:** Não é parte do escopo de D19-B (que trata só de tipos). Recomenda-se abrir **HF-LATENT-RPC-MISSING-01** com decisão de produto: (a) criar as RPCs ausentes; (b) substituir por implementação inline; ou (c) remover o gate se nunca foi planejado entrar em produção.

---

## 5. Política nova — Type Escape Discipline

A partir desta data, os escapes restantes passam a ser **decisões conscientes**, não dívida silenciosa. Regra:

> **Nenhum escape de tipo novo entra no código sem justificativa explícita acima da linha.**

### 5.1 Convenção de comentário

```ts
// type-escape: <categoria> — <motivo curto>
// e.g.:
// type-escape: boundary-io — agent JSON shape varies por OS
const adapters = (outputData.adapters || []) as any[];

// type-escape: structural-json — Record<string,unknown> vs Supabase Json
trigger_details: trigger_details as unknown as Json,
```

Categorias permitidas: `boundary-io`, `structural-json`, `sdk-limit`, `ts-limit`, `legacy-domain` (transitório).

### 5.2 Gate de CI proposto (D19-C)

Script `scripts/guard-type-escape-justified.sh`:
- Falha PR se qualquer `as any | as unknown as | as never | @ts-expect-error | @ts-ignore` for adicionado sem comentário `// type-escape: ...` na linha imediatamente anterior.
- Não retroage para escapes existentes (allowlist por arquivo+linha gerada via baseline).

### 5.3 Métrica acompanhada

| Indicador | Meta de longo prazo |
| --- | ---: |
| `@ts-nocheck` / `@ts-ignore` | **0** (congelado) |
| Type Escape Index | ↓ a cada onda |
| Escapes sem justificativa | **0** (após D19-C) |
| Drift real (RPC/coluna inexistente) | **0** |

---

## 6. Validação

```
deno check supabase/functions/auto-remediate/index.ts                  → PASS
deno check supabase/functions/api-gateway/handlers/security-threats.ts → PASS
guard-no-ts-nocheck-tier1.sh                                            → PASS (152 arquivos)
guard-database-types-sync.sh                                            → PASS
```

Nenhuma alteração de runtime. Nenhum novo escape introduzido.

---

## 7. Próximas ondas recomendadas (não autorizadas)

| Onda | Objetivo | Prioridade |
| --- | --- | --- |
| **HF-LATENT-RPC-MISSING-01** | Decidir produto + corrigir RPCs ausentes ou remover gates | **Alta** (segurança operacional) |
| **D19-C** | Implementar `guard-type-escape-justified.sh` + baseline | Alta (impede regressão) |
| **D20-A** | Refatorar bypass de repositório em `ops-checks/use-cases/*` (~50 `as any`) | Média |
| **D20-B** | Migrar inline `as unknown as Json` para `asJson()` de `_shared/json.ts` | Baixa (estético) |
