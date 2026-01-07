# ADR-021: Mandatory Closed-Loop Governance

## Status

Accepted – Implemented (2026-01-07)

## Context

Auditorias SOC 2 e avaliações Red Team identificaram múltiplos ciclos incompletos no sistema:

1. **Alertas de Recurso**: Detectados mas nunca resolvidos automaticamente
2. **Insights de IA**: Gerados mas sem decisão registrada
3. **Jobs Operacionais**: Entregues mas sem fechamento
4. **Métricas Operacionais**: Não visíveis no dashboard admin

Esses gaps não indicavam falha funcional, mas **falha de governança explícita** - o sistema fazia muito trabalho invisível.

## Decision

O sistema passa a exigir e demonstrar **fechamento automático ou humano** para todos os ciclos críticos:

### 1. Alertas de Recurso

- **Auto-resolução via trigger** no banco de dados
- Quando métricas normalizam (CPU < 80%, Memory < 85%, Disk < 85%), alertas são automaticamente resolvidos
- Implementado via `tr_auto_resolve_resource_alerts` trigger

### 2. AI Insights

- **Auto-triagem** apenas para severidade baixa (`info`, `warning`)
- Insights críticos permanecem requerendo ação humana
- Auto-triagem após 7 dias sem ação
- Razão armazenada em `metadata.auto_triage_reason`
- Cron job diário: `auto-triage-insights`

### 3. Jobs Operacionais

- Visibilidade via `SystemCyclesHealthCard`
- Cancelamento automático após SLA excedido (via cron existente)

### 4. Visibilidade

- Dashboard mostra gaps ativamente via `GapsSummaryCard`
- Saúde dos ciclos via `SystemCyclesHealthCard`
- Nenhum "trabalho invisível"

## Technical Implementation

### Database Trigger

```sql
CREATE TRIGGER tr_auto_resolve_resource_alerts
  AFTER INSERT ON agent_system_metrics
  FOR EACH ROW
  EXECUTE FUNCTION auto_resolve_resource_alerts();
```

### Auto-Triage Cron Job

```toml
[functions.auto-triage-insights]
verify_jwt = false
schedule = "0 6 * * *"
```

### Dashboard Components

- `GapsSummaryCard`: Mostra insights não triados, alertas não resolvidos
- `SystemCyclesHealthCard`: Mostra saúde de playbooks, jobs, agents, DLQ

## Consequences

### Positive

- ✅ Auditor vê ciclos fechados end-to-end
- ✅ Reduz fadiga operacional (menos alertas manuais)
- ✅ Evidência clara de controle contínuo
- ✅ Sistema demonstra o que faz

### Negative

- ⚠️ Pequena automação adicional - mitigada por thresholds conservadores
- ⚠️ Auto-triagem pode ignorar insights relevantes - mitigado por excluir `critical`

## Evidence

- Migration: `20260107_close_operational_cycles.sql`
- Trigger: `tr_auto_resolve_resource_alerts`
- Edge Function: `auto-triage-insights`
- Components: `GapsSummaryCard`, `SystemCyclesHealthCard`
- Audit logs com timestamps de resolução

## Status dos Ciclos Após Implementação

| Ciclo | Antes | Depois |
|-------|-------|--------|
| Alert → Resolve | Quebrado | ✅ Automático via trigger |
| Insight → Triagem | Passivo | ✅ Auto-triagem info/warning > 7 dias |
| Job → Completion | Invisível | ✅ Visível no dashboard |
| Agent → Health | Sem monitoramento | ✅ GapsSummaryCard |
| Gaps → Visibilidade | Oculto | ✅ Explícito no dashboard |

## Related ADRs

- ADR-007: Active Agents View
- ADR-008: Incident Governance

## Authors

- System (Auto-generated)
- Date: 2026-01-07
