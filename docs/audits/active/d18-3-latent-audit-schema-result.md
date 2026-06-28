# D18-3 — LATENT-AUDIT-SCHEMA-01 (resultado)

**Status:** ENCERRADO
**Escopo:** consumidores de `system_audits`, `red_team_assessments` e demais
inserts de auditoria/AI que sobreviviam via `as never` / `as unknown as ...`
após o drift de typegen (D18-2).
**Premissa:** typegen regenerado em D18-2 já reflete colunas `tenant_id`,
`metrics_snapshot`, `evidence_basis`, `falsification_criteria`,
`attack_vectors` etc. como `Json | null`.

## 1. Casts removidos

| Arquivo | Antes | Depois |
|---|---|---|
| `ai-action-executor/index.ts` (insert `ai_action_executions`) | `... as never` | `asJson(payload)` + Insert tipado |
| `ai-predict-agent-failure/index.ts` (insert `ai_failure_predictions`) | `... as never` | `asJson(predictions)` |
| `ai-system-analyzer/index.ts` (insert `system_analyses`) | `... as never` | `asJson(analysis)` |
| `ai-router/handlers/correlate-alerts.ts` (insert `ai_alert_correlations`) | `... as never` | `asJson(correlation)` |
| `ai-system-audit/index.ts` (insert `system_audits`) | `insertData as never` + `as unknown as Record<string, unknown>` no fallback | `SystemAuditInsert` nominal + `toRecord(createFallbackAudit(...))` |
| `ai-full-audit/index.ts` (inserts `red_team_assessments` e `system_audits`) | 2× `... as never` + 2× `as unknown as Record<string, unknown>` + `attack_vectors as any[]` | `RedTeamInsert` / `SystemAuditInsert` nominais, `asJson()` para colunas Json, `toRecord()` no fallback, narrowing via `Array.isArray` para `attack_vectors` |
| `_shared/ai-multi-provider.ts` (insert `ai_inference_metrics`) | `... as never` | Insert literal (typegen já casa) |

**Total de casts amplos removidos:** 11 (`as never` ×7, `as unknown as Record<string, unknown>` ×3, `as any[]` ×1).

## 2. Casts remanescentes (justificados)

| Localização | Cast | Justificativa |
|---|---|---|
| `_shared/json.ts:40` (`toRecord`) | `value as unknown as Record<string, unknown>` | Único ponto centralizado; converte `Json` recursivo do Supabase para `Record<string, unknown>` quando o caller já validou `typeof === 'object'`. Documentado no helper. |
| `_shared/json.ts` (`asJson`) | `value as unknown as Json` | Mesma motivação: invariância estrutural entre `Record<string, unknown>` e `Json`. Centralizado e auditável. |
| `_shared/ai-multi-provider.ts:99` (`input as any` em `fetchWithTimeout`) | `as any` | Fora do escopo de auditoria; ponto único entre `Request | URL | string` do `fetch` e o wrapper interno. Será tratado em onda futura de hardening de rede (não bloqueia D18-3). |

Nenhum `as never` permanece nos consumidores de auditoria.
Nenhum `as any` foi introduzido por este bloco.

## 3. Alinhamento schema ↔ typegen ↔ código

Validado contra `src/integrations/supabase/types.ts` (regenerado em D18-2):

| Tabela | Colunas Json que exigiam alinhamento | Confere |
|---|---|---|
| `system_audits` | `metrics_snapshot`, `evidence_basis`, `falsification_criteria`, `tenant_id`, `prompt_hash`, `recommendation` | ✅ |
| `red_team_assessments` | `attack_vectors`, `metrics_snapshot`, `evidence_basis`, `falsification_criteria`, `tenant_id` | ✅ |
| `ai_inference_metrics` | `request_metadata` (não usado), demais escalares | ✅ |
| `ai_action_executions`, `ai_failure_predictions`, `ai_alert_correlations`, `system_analyses` | colunas `jsonb` populadas via `asJson()` | ✅ |

Os inserts agora satisfazem `Database['public']['Tables'][T]['Insert']` sem
bypass. O gate `guard-database-types-sync.sh` continua PASS, garantindo que
qualquer drift futuro reabre a divergência imediatamente.

## 4. Zero regressão de runtime

- **Forma do payload persistido:** mantida campo-a-campo. `asJson()` é
  identity em runtime (`value as unknown as Json` é uma asserção de tipo,
  zero custo em JS). `toRecord()` preserva o objeto literal.
- **Severidade / actor_type / timestamps:** nenhum desses campos foi
  reescrito; apenas o tipo de chegada mudou.
- **Fallbacks:** `createFallbackAudit()` e `createFallbackRedTeam()`
  continuam produzindo o mesmo objeto; só a *embalagem* (`toRecord`) mudou.
- **`deno check`:** PASS nos 9 arquivos alterados + arquivos transitivos
  (`trend-analyzer.ts`, `dimension-mapper.ts` corrigidos por pequenos
  ajustes de narrowing pré-existentes que estavam mascarados — sem mudança
  de comportamento).
- **Gates do repo:** `guard-no-ts-nocheck-tier1.sh` PASS, `guard-database-types-sync.sh` PASS.

## 5. Consumidores validados

`deno check` limpo nas chains:

1. `ai-system-audit/index.ts` → `dimension-mapper.ts` → `system_audits` insert
2. `ai-full-audit/index.ts` → `red_team_assessments` + `system_audits` inserts (fluxo completo: red team → análise → guardrails → persistência)
3. `ai-action-executor/index.ts` → `ai_action_executions` insert
4. `ai-predict-agent-failure/index.ts` → `trend-analyzer.ts` → `ai_failure_predictions` insert
5. `ai-system-analyzer/index.ts` → `system_analyses` insert
6. `ai-router/handlers/correlate-alerts.ts` → `ai_alert_correlations` insert
7. `_shared/ai-multi-provider.ts` (`logInference`) → `ai_inference_metrics` insert
8. `_shared/json.ts` consumido por todos os acima

## 6. Bugs pré-existentes desmascarados

Removidos os `as never`, dois pontos quietos vieram à tona e foram
**corrigidos sem mudar lógica**:

- `ai-predict-agent-failure/trend-analyzer.ts`: `MetricRow` e `AgentInfo`
  declaravam campos como `number`/`string` mas o Postgres devolve
  `number | null` / `string | null`. Ajustado para refletir o contrato real.
- `ai-system-audit/index.ts`: `analysisResult` podia ser `null` ao chegar
  em `buildAuditInsertData`; agora começa com fallback determinístico e só
  é sobrescrito quando o parse devolve objeto válido.
- `ai-system-audit/dimension-mapper.ts`: indexação dinâmica em `unknown`
  agora passa por um cast nominal para um shape `{ score?; analysis? }`,
  eliminando o erro implícito de `any`.

## 7. Conclusão

> **LATENT-AUDIT-SCHEMA-01 encerrado.**
>
> O problema é estrutural e foi resolvido na raiz (typegen alinhado em
> D18-2 + remoção dos bypasses em D18-3). Os dois casts residuais em
> `_shared/json.ts` são centralizados, documentados e formam o limite
> técnico entre `Json` recursivo do Supabase e `Record<string, unknown>`
> do código de aplicação — não há caminho de tipos para eliminá-los sem
> reescrever a tipagem do `supabase-js`. Nenhum cast permanece nos call
> sites de auditoria.
