# D16-C2 — AI Analysis (Result)

**Data:** 2026-06-27
**Escopo:** Saneamento de `@ts-nocheck` em handlers de IA de análise:
`ai-analyze-agent`, `ai-full-audit`, `ai-predict-agent-failure`,
`ai-quality-check` e helpers exclusivos.

---

## 1. Resultado

| Métrica | Antes | Depois |
| --- | ---: | ---: |
| `@ts-nocheck` ativos (`supabase/functions/`) | 33 | **28** |
| Arquivos no gate Tier 1 | 108 | **115** |
| Redução acumulada vs baseline D13 (96) | ~66% | **~71%** |

`deno check` PASS em todos os alvos saneados.
`bloco-c-gates` PASS. `guard-no-ts-nocheck-tier1` PASS.

---

## 2. Arquivos saneados (7)

| Arquivo | Mudança | Runtime |
| --- | --- | --- |
| `ai-analyze-agent/index.ts` | Cast localizado `agent as Agent` / `context as AgentContext` em 2 call-sites de `buildContextSummary`/`generateBasicAnalysis` (Zod infere fields opcionais sob nossa tsconfig; o schema garante presença em runtime) | preservado |
| `ai-full-audit/index.ts` | Adicionados helpers locais `asMetrics()` / `asRecord()` para narrow de `Json` → `Record<string, unknown>` consumido pelas funções deterministicas. Casts `as unknown as Record<string, unknown>` nas 2 fallback factories. `insert(... as never)` nas 2 chamadas `system_audits` e `red_team_assessments` (drift de tipo, vide §4) | preservado |
| `ai-full-audit/helpers.ts` | Remoção limpa (já passava) | preservado |
| `ai-predict-agent-failure/index.ts` | Cast `insights as never` no insert de `ai_insights` (campo `evidence` tipado como `Json`) | preservado |
| `ai-predict-agent-failure/trend-analyzer.ts` | Sem `@ts-nocheck` no original, mantido limpo | preservado |
| `ai-quality-check/index.ts` | Remoção limpa | preservado |
| `ai-quality-check/handlers.ts` | Interface local `InferenceMetricRow` narrow para o resultado do `select()` de `ai_inference_metrics`. `metricsRaw ?? []` mantém defensive null-coalescing | preservado |

Nenhum prompt, modelo, provider, cache, retry, ordem de execução,
SQL projetado, payload HTTP, contrato público, auditoria ou política de
service_role foi alterado.

---

## 3. Casts localizados introduzidos

| Tipo | Quantidade | Justificativa |
| --- | ---: | --- |
| `as never` (insert supabase-js bypass) | 3 | Drift entre Database types e schema real (red_team_assessments / system_audits / ai_insights.evidence — todos pré-existentes) |
| `as unknown as Record<string, unknown>` | 2 | Fallback factories retornam tipos nomeados (`FallbackRedTeamResult` / `FallbackAuditResult`) sem index signature |
| `as Agent` / `as AgentContext` | 2 | Reconciliar Zod inferred shape com domain interfaces |
| Helpers locais `asMetrics()` / `asRecord()` | 1 par | Substituem N casts repetidos por uma narrowing function reutilizável (8 call-sites convergidos) |

Total de `as` localizados adicionados: **7** (consolidados em 4 padrões com
comentários `D16-C2:` documentando o motivo). Zero `as any`. Zero casts amplos.

---

## 4. Bugs latentes / follow-ups

### LATENT-AUDIT-SCHEMA-01 — Types drift em `red_team_assessments`

O insert em `ai-full-audit/index.ts:100` usa `tenant_id`, mas o tipo gerado
`Database['public']['Tables']['red_team_assessments']['Insert']` **não expõe
`tenant_id`** (nem outras 4 colunas confirmadas no DB via
`information_schema`). Verificado:

```
SELECT column_name FROM information_schema.columns
 WHERE table_name='red_team_assessments';
-- id, tenant_id, threat_level, red_score, attack_vectors, residual_risks,
-- threat_*, executive_threat_summary, worst_case_scenario,
-- recommended_hardening, ai_model, ai_prompt_hash, ai_response_raw,
-- metrics_snapshot, created_at, binary_criteria, criteria_count_true
```

Schema OK; tipos `database.types.ts` desatualizados para esta tabela. Mesmo
sintoma em `system_audits` (overload 1 reclama de propriedades ausentes).
Mitigado com `insert(... as never)` por enquanto.

**Follow-up:** abrir `HF-TYPES-REGEN-01` para regenerar `database.types.ts`
e remover os casts `as never` deste bloco. Sem urgência: runtime correto.

### Sem bugs de runtime detectados nesta onda

Diferente de D16-C1, não houve schema-drift de SELECT/INSERT real (todos os
campos referenciados existem no schema). Os erros foram puramente de tipagem
gerada vs realidade do banco.

---

## 5. Gates

- ✅ `deno check` nos 7 alvos saneados.
- ✅ `scripts/guard-no-ts-nocheck-tier1.sh` PASS com **115 arquivos protegidos**.
- ✅ `scripts/bloco-c-gates.sh` PASS (bak/orig, dangerouslySetInnerHTML, console).

---

## 6. Próxima onda

Liberado para **D16-C3 (AI Security)** assim que autorizado.
`HF-TYPES-REGEN-01` pode ser executado em paralelo, independente das ondas
restantes (escopo isolado: regen de tipos + remoção dos 3 casts `as never`
documentados nesta seção).
