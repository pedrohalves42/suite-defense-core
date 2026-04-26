
CREATE OR REPLACE FUNCTION public.get_agents_snapshots_list(p_tenant_id uuid DEFAULT NULL)
RETURNS SETOF jsonb
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
  SELECT jsonb_build_object(
    'agent_id', a.id, 'tenant_id', a.tenant_id, 'hostname', a.hostname,
    'os_type', a.os_type, 'version', a.agent_version, 'last_heartbeat', a.last_heartbeat,
    'online', a.last_heartbeat > (now() - interval '15 minutes'),
    'latency_ms', EXTRACT(epoch FROM now() - a.last_heartbeat) * 1000::numeric,
    'agent_state', a.agent_state,
    'safe_mode', COALESCE(a.safe_mode_entered_at IS NOT NULL, false),
    'safe_mode_reason', a.safe_mode_reason,
    'is_isolated', COALESCE(a.is_isolated, false),
    'is_throttled', COALESCE(a.is_throttled, false),
    'active_issues', 0::bigint,
    'unresolved_insights', (SELECT count(*) FROM ai_insights ai WHERE ai.agent_id = a.id AND ai.status = 'open'),
    'snapshot_at', now()
  )
  FROM agents a
  WHERE a.archived_at IS NULL AND a.status = 'active'
    AND a.tenant_id = v_effective_tenant_id;
END;
$$;
