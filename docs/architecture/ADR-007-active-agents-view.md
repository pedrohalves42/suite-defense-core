# ADR-007 — Introdução da view `active_agents`

## Status
**ACEITA**

## Contexto
O sistema utiliza agentes que podem ser arquivados por razões operacionais
(desativação, troca de hardware, erro de instalação).

Historicamente, RPCs e views operacionais consultavam diretamente a tabela `agents`,
causando:
- Métricas infladas
- Agentes "fantasma" em dashboards
- Alertas incorretos
- Decisões automáticas inválidas

## Decisão
Criar a view canônica `active_agents` com o filtro:
```sql
CREATE VIEW active_agents AS
SELECT * FROM agents WHERE archived_at IS NULL;
```

Todas as RPCs, views e automações operacionais **DEVEM** usar essa view.

## Consequências Positivas
- Métricas refletem apenas agentes válidos
- Arquivamento não causa regressão
- Histórico preservado para auditoria
- Auditoria simplificada
- Governança explícita e verificável

## Consequências Negativas
- RPCs antigas precisaram de migração
- Uso incorreto de `agents` passa a ser erro arquitetural
- Necessidade de enforcement em CI

## Alternativas Consideradas

### 1. Espalhar `AND archived_at IS NULL` manualmente
**Rejeitado**: Alto risco de regressão, difícil manutenção, inconsistências inevitáveis.

### 2. Soft-delete completo (deletar registros)
**Rejeitado**: Perda de dados históricos, impossibilita auditoria forense.

### 3. Coluna `is_active` boolean
**Rejeitado**: Menos expressivo que timestamp, não indica quando foi arquivado.

## Implementação

### Views Migradas para `active_agents`
| View | Status |
|------|--------|
| `agents_health_view` | ✅ Migrada |
| `v_agent_health_summary` | ✅ Migrada |
| `v_agent_execution_health` | ✅ Migrada |
| `agents_safe` | ✅ Migrada |
| `v_agent_lifecycle_state` | ✅ Migrada |
| `v_problematic_agents` | ✅ Migrada |
| `v_system_operations_summary` | ✅ Migrada |
| `v_tenant_plan_status` | ✅ Migrada |
| `hmac_signatures` | ✅ Migrada |
| `v_execution_chain_health` | ✅ Migrada |
| `v_action_center` | ✅ Migrada |

### RPCs Migradas
| RPC | Status |
|-----|--------|
| `get_agents_for_dashboard_v3` | ✅ Migrada |
| `calculate_fleet_health_score_v2` | ✅ Migrada |
| `diagnose_agent_issues` | ✅ Migrada |
| `get_tenant_agent_summary` | ✅ Migrada |

### Infraestrutura de Arquivamento
- Tabela `agent_archive_events` para auditoria
- Função `archive_agent()` para arquivamento padronizado
- RLS policies para controle de acesso

### Schema Validation Tests (CI Guards)
| Test | Location | Purpose |
|------|----------|---------|
| `assert_v_agent_lifecycle_state_columns.sql` | `tools/tests/` | Validates view has all frontend-required columns |
| `assert_active_agents_columns.sql` | `tools/tests/` | Validates active_agents has all core columns |

### RLS Strategy (Differentiated Access)
| Object | Use Case | Access Level |
|--------|----------|--------------|
| `agents` | Historical + Admin | Restricted (admin/auditor only) |
| `active_agents` | Operational | Standard (authenticated) |

**Policy**: Direct SELECT on `agents` requires `admin` or `auditor` role via `has_role()` function.

### ANA Reason Tree Integration
- View `v_agent_archive_reason_tree` provides structured archive reasons
- View `v_decision_with_archive_context` combines decisions with archive context
- Enables ANA to explain: "Alert suppressed because agent was archived (reason: never_connected)"

## Governance
Esta decisão é enforced pela Policy **DATA-AGENT-001**.

## Data
2026-01-02

## Autores
Security / Platform / Governance Team
