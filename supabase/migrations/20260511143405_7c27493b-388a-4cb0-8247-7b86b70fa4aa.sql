-- 1. Remover RPCs antigos para recriar com retorno TABLE
DROP FUNCTION IF EXISTS public.get_agents_list(uuid, boolean);
DROP FUNCTION IF EXISTS public.get_agents_snapshots_list(uuid);

-- 2. Recriar get_agents_list como TABLE
CREATE OR REPLACE FUNCTION public.get_agents_list(
  p_tenant_id uuid,
  p_include_archived boolean DEFAULT false
)
RETURNS TABLE (
  id uuid,
  tenant_id uuid,
  agent_name text,
  hostname text,
  status text,
  os_type text,
  os_version text,
  agent_version text,
  agent_version_code integer,
  display_name text,
  enrolled_at timestamp with time zone,
  last_heartbeat timestamp with time zone,
  last_block_sync_at timestamp with time zone,
  agent_state text,
  is_throttled boolean,
  is_isolated boolean,
  skip_firewall_remediation boolean,
  archived_at timestamp with time zone
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Use the robust assertion logic
  PERFORM public._assert_caller_tenant(p_tenant_id);

  RETURN QUERY
  SELECT 
    a.id, a.tenant_id, a.agent_name,
    a.hostname, a.status, a.os_type,
    a.os_version, a.agent_version,
    a.agent_version_code, a.display_name,
    a.enrolled_at, a.last_heartbeat,
    a.last_block_sync_at, a.agent_state,
    a.is_throttled, a.is_isolated,
    COALESCE(a.skip_firewall_remediation, false),
    a.archived_at
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND (p_include_archived OR a.archived_at IS NULL);
END;
$$;

-- 3. Recriar get_agents_snapshots_list como TABLE
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
  v_effective_tenant_id := COALESCE(p_tenant_id, get_active_tenant_id());
  
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
  WHERE a.archived_at IS NULL 
    AND a.status IN ('active', 'offline') -- CORREÇÃO: Incluir agentes offline na visão geral
    AND a.tenant_id = v_effective_tenant_id;
END;
$$;

-- 4. Limpeza de RLS redundante
DROP POLICY IF EXISTS agents_deny_direct_select ON public.agents;

-- 5. Garantir permissões de execução para usuários autenticados
GRANT EXECUTE ON FUNCTION public.get_agents_list(uuid, boolean) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agents_snapshots_list(uuid) TO authenticated;
