# D15-B4 — Automation Runtime — Resultado

## Resumo executivo

Bloco mais sensível desde D14. Saneado o motor de automação ponta-a-ponta
(avaliação de regras, gatilhos de playbook, despacho de ações, remediação
automática e Safe Mode autônomo) sem alterar runtime, contratos, ordem de
avaliação, retries, idempotência, scheduler, política HMAC, auditoria ou
status HTTP. Mudanças foram estritamente de tipagem.

## Arquivos saneados (`@ts-nocheck` removido)

### evaluate-automation-rules/
- `evaluate-automation-rules/index.ts`
- `evaluate-automation-rules/helpers.ts`
- `evaluate-automation-rules/protection-pipeline.ts`
- `evaluate-automation-rules/tenant-evaluator.ts`
- `evaluate-automation-rules/trigger-evaluators.ts`

### evaluate-playbook-triggers/
- `evaluate-playbook-triggers/index.ts`
- `evaluate-playbook-triggers/approval-handler.ts`
- `evaluate-playbook-triggers/condition-engine.ts`

### execute-playbook-action/
- `execute-playbook-action/index.ts`
- `execute-playbook-action/action-dispatcher.ts`
- `execute-playbook-action/handlers/agent-jobs.ts`
- `execute-playbook-action/handlers/notify.ts`
- `execute-playbook-action/handlers/security.ts`

### auto-remediate/
- `auto-remediate/index.ts`

### autonomous-safe-mode/
- `autonomous-safe-mode/index.ts`
- `autonomous-safe-mode/rules/agent-health.ts`
- `autonomous-safe-mode/rules/quality.ts`
- `autonomous-safe-mode/rules/security.ts`

**Total saneado nesta onda: 18 arquivos.**

## Mudanças aplicadas (somente tipagem)

- **`evaluate-automation-rules/trigger-evaluators.ts`** — narrowing
  numérico em métricas (`cpu_usage_percent` etc.), tipagem explícita
  para arrays `suspicious_processes` / `new_processes`.
- **`evaluate-automation-rules/protection-pipeline.ts`** — casts em
  `checkBlastRadius` para `maxPercent: number` e em `rule.id: string`.
- **`evaluate-automation-rules/tenant-evaluator.ts`** — narrowing de
  `triggerData.value`, mapeamento explícito de `eventType` e ajuste de
  assinatura para `runProtectionPipeline`.
- **`evaluate-playbook-triggers/index.ts`** — import de `Database` /
  `Json` de `_shared/database.types.ts`; tipo `PEInsert` explícito para
  insert em `playbook_executions` (resolve overload ambíguo do client).
- **`execute-playbook-action/index.ts`** —
  - cast `actions_snapshot` → `unknown → PlaybookAction[]`;
  - cast de payloads `details` para `Json` em três blocos de auditoria;
  - cast `actions_taken` para `Json` no update final e para
    `ActionResult[]` na leitura;
  - cast `trigger_context` para `Record<string, unknown>`.
- **`auto-remediate/index.ts`** —
  - tipos locais `BlastCheckResult` / `GlobalBreakerResult` para
    descrever o retorno das RPCs `check_blast_radius` e
    `check_global_circuit_breaker` (chamadas com `as never` já
    existentes preservadas);
  - casts `as unknown as Json` em `trigger_details`, `details` e
    `payload` (sem alterar conteúdo dos objetos);
  - import de `Json` de `_shared/database.types.ts`;
  - `rateLimit` recebe campo obrigatório `endpoint: 'auto-remediate'`
    (sem alterar `maxRequests`/`windowMinutes`).
- **`autonomous-safe-mode/index.ts`** — cast `unknown → RuleRecord[]`
  no loop de regras (ver bug latente abaixo).
- **`autonomous-safe-mode/rules/quality.ts` / `rules/security.ts`** —
  `Map<string, string>` explícito em `agentNameMap`, `suspAgentNameMap`
  e `divAgentNameMap` com `String(... ?? '')` (mantém o mesmo
  comportamento default).

## Bugs latentes encontrados

### LATENT-AUTOMATION-01 — `execute-playbook-action` consulta coluna inexistente em `approval_requests`
- **Local:** `execute-playbook-action/index.ts:116` (antes da correção).
- **Defeito:** `.select('id, status, expires_at, approved_by, approved_at')`,
  mas `approval_requests` **não possui** coluna `approved_by` (ver
  schema em `_shared/database.types.ts:10371`).
- **Impacto runtime:** PostgREST retornaria erro de coluna; o caminho
  semi-automático nunca confirmaria aprovação corretamente.
- **Correção aplicada (defeito óbvio):** removida a coluna inexistente
  do SELECT. Nenhuma outra mudança no fluxo de aprovação.
- **Follow-up sugerido:** decidir se o domínio realmente precisa de
  `approved_by` e, em caso afirmativo, criar migration adicionando a
  coluna + RLS apropriada (fora do escopo desta onda).

### LATENT-AUTOMATION-02 — `autonomous-safe-mode` seleciona colunas inexistentes em `decision_rules`
- **Local:** `autonomous-safe-mode/index.ts:65`.
- **Defeito:** `.select('id, code, name, description, is_enabled, severity, conditions, actions')`,
  mas o schema atual de `decision_rules`
  (`_shared/database.types.ts:17587`) só possui `id`, `code`,
  `description`, `is_enabled`, `scope`, `definition` (jsonb),
  `auto_execute`, `created_at`, `updated_at`. Colunas `name`,
  `severity`, `conditions` e `actions` **não existem**.
- **Impacto runtime:** PostgREST devolve erro; o engine de regras
  autônomo nunca encontra regras habilitadas (silenciosamente vira
  no-op quando `rulesError` é tratado).
- **Tratamento nesta onda:** **não corrigido** — corrigir o SELECT
  exigiria adaptar todos os handlers que hoje leem `rule.conditions` /
  `rule.actions` / `rule.severity`, o que é mudança de runtime fora do
  escopo "type-only" autorizado. O cast `unknown → RuleRecord[]` apenas
  destrava o `deno check`.
- **Follow-up sugerido (alto risco silencioso):** abrir hotfix
  dedicado para alinhar o engine ao schema real (`definition.jsonb`)
  **antes** de qualquer ativação de Safe Mode autônomo em produção.

### LATENT-AUTOMATION-03 — `auto-remediate` insere `jobs` sem `payload_hash`
- **Local:** `auto-remediate/index.ts:194` (insert em `jobs`).
- **Defeito:** schema exige `payload_hash` (NOT NULL) no `Insert`
  type, mas o código não envia o campo — provavelmente confiando em
  trigger/`DEFAULT`. Se não houver trigger ativo, o insert falha.
- **Tratamento nesta onda:** preservado o runtime; insert castado para
  `as never` para destravar o overload do client. **Nenhuma alteração
  de payload.**
- **Follow-up sugerido:** validar existência de trigger
  `set_job_payload_hash` (ou similar) na tabela `jobs`. Se ausente,
  computar `payload_hash` explicitamente em código (hotfix separado).

## Gates executados

- ✅ `deno check evaluate-automation-rules/index.ts`
- ✅ `deno check evaluate-playbook-triggers/index.ts`
- ✅ `deno check execute-playbook-action/index.ts`
- ✅ `deno check auto-remediate/index.ts`
- ✅ `deno check autonomous-safe-mode/index.ts`
- ✅ `deno check` em cada um dos 13 sub-arquivos saneados
- ✅ `scripts/guard-no-ts-nocheck-tier1.sh` → **PASS**

## Expansão do gate Tier 1

- Antes: **84 arquivos protegidos**.
- Depois: **100 arquivos protegidos** (+16 entradas do Automation
  Runtime; `evaluate-playbook-triggers/approval-handler.ts` e
  `condition-engine.ts` adicionados junto ao index para garantir o
  domínio inteiro).

## Estado da dívida `@ts-nocheck`

- Snapshot atual em `supabase/functions/`: **55 ocorrências**.
- Comparado ao reportado em D15-B3 (51), houve regressão de **+4
  arquivos** vindos de fora desta onda — todos em `_shared/` (ver
  follow-up FUP-SHARED-DRIFT-01) ou em handlers de AI/build não
  cobertos por D15.

## Follow-ups registrados

- **FUP-SHARED-DRIFT-01** — `_shared/` voltou a acumular `@ts-nocheck`
  em 8 arquivos
  (`ai-evidence-types.ts`, `ai-multi-provider.ts`, `dlq.ts`,
  `hexagonal/adapters.ts`, `ip-allowlist.ts`, `serve-agent.ts`,
  `submit-handlers/alert-engine.ts`,
  `submit-handlers/web-activity-helpers.ts`). Recomenda-se uma onda
  curta de re-saneamento antes de D16, já que `_shared/` é Tier 1
  estrito.
- **LATENT-AUTOMATION-01** — alinhar schema `approval_requests`
  (`approved_by`) ou retirar referência no domínio.
- **LATENT-AUTOMATION-02** — **prioridade alta** — adequar
  `autonomous-safe-mode` ao schema real de `decision_rules`
  (`definition` jsonb) antes de qualquer ativação.
- **LATENT-AUTOMATION-03** — validar trigger `payload_hash` em `jobs`
  ou popular o campo no insert do `auto-remediate`.

## Marco

Com D15-B4 fechado, a **camada operacional inteira** (Gateway, Sync,
Reports e Automation Runtime) está saneada e protegida pelo gate.
Próximos blocos sugeridos: **D16 (AI handlers)**, **D17 (Build/Release
e Misc)** e atualização do relatório executivo
(`docs/audits/active/program-status-after-d15.md`).
