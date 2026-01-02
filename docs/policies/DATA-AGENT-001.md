# DATA-AGENT-001 — Uso obrigatório de `active_agents`

## Status
**ENFORCED**

## Objetivo
Garantir que agentes arquivados não impactem métricas, decisões automáticas,
dashboards operacionais ou regras de execução.

## Regra
É **PROIBIDO** o uso direto da tabela `agents` em:
- RPCs operacionais
- Views operacionais
- Edge Functions
- Queries usadas por dashboards, alertas ou automações

## Uso permitido de `agents`
A tabela `agents` só pode ser usada diretamente em:
- Auditoria histórica
- Administração (archival, compliance, forense)
- Relatórios offline ou regulatórios

## Uso obrigatório
Toda lógica operacional **DEVE** usar:
- `active_agents`
- ou Views que dependam exclusivamente de `active_agents`

## Exceções
Qualquer exceção exige:
- ADR aprovada
- Justificativa explícita
- Evidência de que agentes arquivados não impactam decisões

## Enforcement Técnico

### Query de Auditoria (CI / Review)
```sql
-- Falha se retornar qualquer linha operacional
SELECT routine_name
FROM information_schema.routines
WHERE routine_schema = 'public'
  AND routine_definition ILIKE '%FROM agents%'
  AND routine_definition NOT ILIKE '%active_agents%';
```

### Query de Views
```sql
SELECT viewname
FROM pg_views
WHERE schemaname = 'public'
  AND definition ILIKE '%agents%'
  AND definition NOT ILIKE '%active_agents%';
```

## Implementação
- Review obrigatório em PR
- Query de auditoria em CI pipeline
- Falha de build se violada

## Histórico
| Data | Ação | Autor |
|------|------|-------|
| 2026-01-02 | Policy criada | Governance/Platform |
