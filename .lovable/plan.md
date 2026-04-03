
# Fase 1C: Inline Playbook Namespace no ops-gateway

## Objetivo
Eliminar cold starts do namespace `playbook:*` no ops-gateway, movendo a lógica para handlers inlined. **Meta: -11 cold starts por chamada.**

## Análise de Viabilidade

| Função | Linhas | Auth | Sub-módulos | Decisão |
|--------|--------|------|-------------|---------|
| execute-playbook | 146 | serveInternal | 0 | ✅ Inline |
| process-playbook-trigger-logs | 105 | serveInternal | 0 | ✅ Inline |
| rollback-by-decision-event | 146 | serveTenant | 0 | ✅ Inline |
| rollback-remediation | 95 | serveTenant | 0 | ✅ Inline |
| resolve-action-policy | 81 | serveTenant | 0 | ✅ Inline |
| oncall-integration | 110 | serveInternal | 0 | ✅ Inline |
| calculate-risk-score | 163 | serveTenant | 0 | ✅ Inline |
| run-attack-simulation | 155 | serveTenant | 0 | ✅ Inline |
| soar-engine | 174 | serveInternal | 1 (rules.ts) | ✅ Inline |
| auto-execute-ai-actions | 272 | serveInternal | 2 (policy+executor) | ✅ Inline |
| create-itsm-ticket | 200 | serveTenant | 0 | ✅ Inline |

### Mantidas Standalone (6) — Razões Técnicas

| Função | Linhas Total | Razão |
|--------|-------------|-------|
| execute-playbook-action | 318+ | Orchestrator complexo com handlers/ e action-dispatcher |
| auto-remediate | 311 | Blast radius checks, lógica de segurança crítica |
| evaluate-automation-rules | 700+ | 5 sub-módulos, tenant-evaluator de 296 linhas |
| evaluate-playbook-triggers | 338 | 3 sub-módulos (condition-engine, approval-handler) |
| autonomous-safe-mode | 1282 | 3 rules/ processors (380+ linhas cada) |
| evaluate-software-risk | 145 | servePublic — auth incompatível com gateway |

## Plano de Execução

### Etapa 1 — Criar handlers no ops-gateway (3 arquivos)

1. **`handlers/playbook-core.ts`** (~500 linhas)
   - handleExecutePlaybook
   - handleProcessPlaybookTriggerLogs
   - handleRollbackByDecisionEvent
   - handleRollbackRemediation
   - handleResolveActionPolicy

2. **`handlers/playbook-automation.ts`** (~500 linhas)
   - handleSoarEngine (+ rules inline)
   - handleAutoExecuteAiActions (+ policy-resolver + action-executor inline)
   - handleOncallIntegration
   - handleCreateItsmTicket

3. **`handlers/playbook-analysis.ts`** (~320 linhas)
   - handleCalculateRiskScore
   - handleRunAttackSimulation

### Etapa 2 — Registrar no ops-gateway/index.ts
- Adicionar 11 imports e registros no `INLINED_HANDLERS`
- Remover 11 entradas do `ACTION_TO_FUNCTION` proxy map

### Etapa 3 — Deletar standalone functions (11)
- Deletar diretórios e chamar `delete_edge_functions`

### Etapa 4 — Deploy e Validação
- Deploy ops-gateway
- Testar via curl todas as 11 ações
- Verificar zero erros de sintaxe nos logs

### Etapa 5 — Documentação
- Atualizar `.lovable/plan.md`
- Atualizar `docs/deno-serve-migration-exceptions.md`
- Atualizar memory de consolidação

## Impacto Estimado
- **-11 cold starts** por chamada playbook
- **-11 funções standalone** (~2200 linhas consolidadas)
- **6 proxies restantes** no namespace playbook (funções complexas)
- **Economia**: ~$2-4/mês em cold start costs
