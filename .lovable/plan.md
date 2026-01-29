
## Objetivo
Resolver todos os problemas identificados nas screenshots:
1. Dashboard mostrando "0 computadores monitorados" para Genial Cred (11 agentes no banco)
2. Erro 500 na RPC `get_audit_raw_metrics` ("more than one row returned by a subquery")
3. Erros 403 em múltiplas tabelas (agent_tokens, agent_releases)
4. IntegrityScoreCard mostrando erro

---

## Diagnóstico Final

### Problema 1: Dashboard Principal (ServerDashboard) mostra 0 computadores
**Causa**: `src/pages/ServerDashboard.tsx` linha 212 ainda usa `agents_safe` view:
```typescript
supabase.from("agents_safe").select("*").eq("tenant_id", tenant.id)
```
Essa view depende de `get_active_tenant_id()` que retorna NULL quando JWT não tem o claim.

**Nota**: O admin Dashboard (`src/pages/admin/Dashboard.tsx`) já foi corrigido e usa RPC corretamente.

### Problema 2: RPC `get_audit_raw_metrics` retorna 500
**Causa**: A função tenta ler de views (`v_tenant_isolation_metrics`, `v_rbac_metrics`, `v_enforcement_compliance`) que:
- Retornam 0 linhas quando `get_active_tenant_id()` = NULL
- Mas podem retornar múltiplas linhas em outros cenários, causando erro "more than one row returned by a subquery"

Logs do banco mostram erros recentes:
- `more than one row returned by a subquery used as an expression`
- `column audit_confidence_gaps.calculated_at does not exist`
- `column ai_actions.handler does not exist`

### Problema 3: Erros 403 (Permission Denied)
**Causa**: Tabelas `agent_tokens` e `agent_releases` não têm RLS policies para SELECT/UPDATE para usuários autenticados.

---

## Implementação (Passo a Passo)

### Fase A: Frontend - Migrar ServerDashboard para RPC (P0)

**Arquivo**: `src/pages/ServerDashboard.tsx`

**Mudança** (linha 212): Trocar query de `agents_safe` por RPC `get_agents_list`:

```typescript
// ANTES:
supabase.from("agents_safe").select("*").eq("tenant_id", tenant.id)

// DEPOIS:
supabase.rpc('get_agents_list', { p_tenant_id: tenant.id, p_include_archived: false })
```

**Mapeamento** (após linha 221):
```typescript
if (agentsRes.data) {
  // Mapear retorno da RPC para formato esperado
  const mappedAgents = (agentsRes.data || []).map((agent: any) => ({
    id: agent.id,
    agent_name: agent.agent_name,
    status: agent.status,
    enrolled_at: agent.enrolled_at,
    last_heartbeat: agent.last_heartbeat,
    tenant_id: agent.tenant_id,
  }));
  setAgents(mappedAgents);
  // ... resto do código existente
}
```

---

### Fase B: Banco - Corrigir RPC `get_audit_raw_metrics` (P0)

**Problema**: Subqueries para views podem retornar múltiplas linhas ou zero.

**Solução**: Usar LIMIT 1 nas subqueries e garantir fallback:

```sql
DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid);

CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- AGENTS (consulta direta - seguro)
    'agents', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
      'online', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status = 'active'),
      'offline', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status != 'active'),
      'in_safe_mode', (SELECT COUNT(*) FROM agent_safe_mode_events WHERE tenant_id = p_tenant_id AND resolved_at IS NULL)
    ),
    
    -- DECISION EVENTS
    'decision_events', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id), 0),
      'by_human', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'human'), 0),
      'by_system', COALESCE((SELECT COUNT(*) FROM decision_events WHERE tenant_id = p_tenant_id AND actor_type = 'system'), 0)
    ),
    
    -- AI ACTIONS
    'ai_actions', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id), 0),
      'human_reviewed', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true), 0),
      'approved', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision = 'approved'), 0),
      'pending', COALESCE((SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND review_decision IS NULL), 0)
    ),
    
    -- DLQ
    'dlq', jsonb_build_object(
      'current', COALESCE((SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND status = 'pending'), 0),
      'total', COALESCE((SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id), 0)
    ),
    
    -- ROLLBACKS
    'rollbacks', jsonb_build_object(
      'total', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id), 0),
      'last_30d', COALESCE((SELECT COUNT(*) FROM agent_rollback_events WHERE tenant_id = p_tenant_id AND created_at > NOW() - INTERVAL '30 days'), 0)
    ),
    
    -- ALERTS
    'alerts', jsonb_build_object(
      'open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false),
      'critical_open', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND resolved = false AND severity = 'critical')
    ),
    
    -- USERS
    'users', jsonb_build_object(
      'count', (SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id)
    ),
    
    -- POLICIES
    'policies', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
      'active', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true)
    ),
    
    -- REMOVIDO: tenant_isolation, rbac, enforcement (views problemáticas)
    -- Substituído por queries diretas simples
    
    -- TENANT STATS (substituindo v_tenant_isolation_metrics)
    'tenant_stats', jsonb_build_object(
      'agent_count', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
      'job_count', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id),
      'user_count', (SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id)
    ),
    
    -- METADATA
    'collected_at', NOW(),
    'version', '3.0.0'
  ) INTO result;

  RETURN result;
END;
$$;
```

---

### Fase C: Banco - Adicionar RLS para agent_tokens e agent_releases (P1)

```sql
-- agent_tokens RLS
ALTER TABLE agent_tokens ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view tokens for agents in their tenant"
ON agent_tokens FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM agents a
    JOIN user_roles ur ON ur.tenant_id = a.tenant_id
    WHERE a.id = agent_tokens.agent_id
    AND ur.user_id = auth.uid()
  )
);

-- agent_releases RLS (já pode ter)
-- Verificar se existe e adicionar policy de SELECT
```

---

## Entregáveis

| Arquivo | Tipo | Prioridade |
|---------|------|------------|
| `src/pages/ServerDashboard.tsx` | Frontend | P0 |
| `get_audit_raw_metrics` migration | Banco SQL | P0 |
| RLS policies para agent_tokens | Banco SQL | P1 |
| RLS policies para agent_releases | Banco SQL | P1 |

---

## Validação

1. **Dashboard Principal** (`/dashboard`):
   - Selecionar "Genial Cred" → Deve mostrar "11 computadores monitorados"
   - Selecionar "Pedro Alves" → Deve mostrar "3 computadores monitorados"

2. **Console do Browser**:
   - Não deve mais mostrar erro 500 em `get_audit_raw_metrics`
   - Não deve mostrar erro 403 para `agent_tokens`

3. **IntegrityScoreCard**:
   - Não deve mais exibir erro de carregamento

---

## Riscos e Cuidados

- A RPC `get_agents_list` retorna campos diferentes do que `agents_safe`. Verificar que o mapeamento está correto.
- Ao remover dependência de views problemáticas em `get_audit_raw_metrics`, algumas métricas avançadas (RLS coverage, RBAC stats) ficam temporariamente indisponíveis - podem ser restauradas depois com queries diretas.
