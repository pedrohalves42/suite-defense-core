
## Fase 2 — Modo Dry-Run, Risk Score e Motor de Correlação

### 2.1 Migração SQL (uma única migração)
- Adicionar colunas `mode` (`active`/`dry_run`/`disabled`), `risk_score`, `false_positive_count`, `true_positive_count`, `last_triggered_at` na tabela `detection_rules`
- Criar tabela `correlation_rules` com campos: `tenant_id`, `rule_name`, `description`, `condition_a` (event_type A), `condition_b` (event_type B), `window_minutes`, `severity`, `mitre_technique_id`, `mode`, `is_enabled`
- Criar tabela `correlation_results` para armazenar matches encontrados
- Criar função SQL `recalculate_risk_scores(p_tenant_id UUID)` que recalcula scores com base em severidade, TP/FP ratios
- Criar função SQL `run_correlation_engine(p_tenant_id UUID)` que executa regras de correlação e insere resultados
- RLS em todas as tabelas novas (tenant isolation)
- Índices otimizados nas novas tabelas

### 2.2 Atualizar hooks frontend
- Atualizar `useDetectionRules` para incluir novas colunas (`mode`, `risk_score`)
- Criar hook `useCorrelationRules` para CRUD de regras de correlação
- Criar hook `useCorrelationResults` para visualizar matches
- Criar mutation `useUpdateRuleMode` para alternar entre active/dry_run/disabled
- Criar mutation `useRuleFeedback` para registrar TP/FP

### 2.3 Validação
- Verificar sintaxe SQL da migração
- Verificar que tipos TypeScript estão corretos
- Garantir zero impacto em performance (índices, limites, janelas de tempo)
