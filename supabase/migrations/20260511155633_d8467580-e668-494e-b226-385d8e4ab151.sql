-- 1. Corrigir inconsistência de dados em agentes (archived status sem archived_at)
UPDATE public.agents 
SET archived_at = enrolled_at -- Fallback para data de matrícula se não houver outra
WHERE status = 'archived' AND archived_at IS NULL;

-- 2. Atualizar get_agents_snapshots_list para ser mais robusta
CREATE OR REPLACE FUNCTION public.get_agents_snapshots_list(
  p_tenant_id uuid DEFAULT NULL
)
RETURNS TABLE (
  agent_id uuid,
  tenant_id uuid,
  hostname text,
  agent_name text,
  os_type text,
  version text,
  last_heartbeat timestamp with time zone,
  online boolean,
  latency_ms numeric,
  agent_state text,
  safe_mode boolean,
  safe_mode_reason text,
  is_isolated boolean,
  is_throttled boolean,
  active_issues bigint,
  unresolved_insights bigint,
  snapshot_at timestamp with time zone
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_effective_tenant_id uuid;
BEGIN
  -- PRIORIDADE: 1. Parâmetro explícito | 2. get_active_tenant_id()
  v_effective_tenant_id := COALESCE(p_tenant_id, get_active_tenant_id());
  
  -- Se for super admin global, ele pode ver o que pediu. Se for usuário comum, validamos.
  IF v_effective_tenant_id IS NOT NULL AND NOT is_current_super_admin() THEN
    PERFORM public._assert_caller_tenant(v_effective_tenant_id);
  END IF;
  
  RETURN QUERY
  SELECT 
    a.id as agent_id, 
    a.tenant_id, 
    a.hostname,
    a.agent_name,
    a.os_type, 
    a.agent_version as version, 
    a.last_heartbeat,
    (a.last_heartbeat > (now() - interval '15 minutes')) as online,
    EXTRACT(epoch FROM now() - a.last_heartbeat) * 1000::numeric as latency_ms,
    a.agent_state,
    COALESCE(a.safe_mode_entered_at IS NOT NULL, false) as safe_mode,
    a.safe_mode_reason,
    COALESCE(a.is_isolated, false) as is_isolated,
    COALESCE(a.is_throttled, false) as is_throttled,
    0::bigint as active_issues,
    (SELECT count(*) FROM ai_insights ai WHERE ai.agent_id = a.id AND ai.acknowledged = false) as unresolved_insights,
    now() as snapshot_at
  FROM agents a
  WHERE 
    (v_effective_tenant_id IS NULL OR a.tenant_id = v_effective_tenant_id) -- Permite visão global para super admins se v_effective_tenant_id for NULL
    AND a.archived_at IS NULL -- Apenas agentes não arquivados
    AND a.status != 'archived'; -- Dupla verificação por segurança
END;
$$;
