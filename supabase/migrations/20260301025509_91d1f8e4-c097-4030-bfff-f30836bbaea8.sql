
-- =============================================================================
-- V-307 Part 2: Convert 6 SQL-language RPCs to plpgsql with tenant guard
-- =============================================================================

-- 1. get_critical_insights_count
CREATE OR REPLACE FUNCTION public.get_critical_insights_count(p_tenant_id uuid)
RETURNS integer
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);
  RETURN (
    SELECT COUNT(*)::INTEGER
    FROM public.ai_insights
    WHERE tenant_id = p_tenant_id
      AND acknowledged = false
      AND severity IN ('critical', 'high')
  );
END;
$function$;

-- 2. get_mfa_user_count
CREATE OR REPLACE FUNCTION public.get_mfa_user_count(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);
  RETURN (
    SELECT jsonb_build_object(
      'total_users', COUNT(DISTINCT ur.user_id),
      'users_with_mfa', COUNT(DISTINCT CASE WHEN mf.id IS NOT NULL THEN ur.user_id END)
    )
    FROM user_roles ur
    LEFT JOIN auth.mfa_factors mf ON mf.user_id = ur.user_id AND mf.status = 'verified'
    WHERE ur.tenant_id = p_tenant_id
  );
END;
$function$;

-- 3. get_recent_jobs
CREATE OR REPLACE FUNCTION public.get_recent_jobs(p_tenant_id uuid, p_limit integer DEFAULT 50)
RETURNS SETOF jobs
LANGUAGE plpgsql SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);
  RETURN QUERY
  SELECT *
  FROM jobs
  WHERE tenant_id = p_tenant_id
  ORDER BY created_at DESC
  LIMIT p_limit;
END;
$function$;

-- 4. get_stale_agents
CREATE OR REPLACE FUNCTION public.get_stale_agents(p_tenant_id uuid, p_threshold_minutes integer DEFAULT 30)
RETURNS TABLE(agent_id uuid, agent_name text, display_name text, hostname text, last_heartbeat timestamptz, minutes_since_heartbeat numeric, agent_version text, status text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);
  RETURN QUERY
  SELECT 
    a.id, a.agent_name, a.display_name, a.hostname, a.last_heartbeat,
    ROUND(EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))/60, 1),
    a.agent_version, a.status
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL AND a.status = 'active'
    AND a.last_heartbeat IS NOT NULL
    AND a.last_heartbeat < NOW() - (p_threshold_minutes || ' minutes')::interval
  ORDER BY a.last_heartbeat ASC;
END;
$function$;

-- 5. get_latest_agent_metrics
CREATE OR REPLACE FUNCTION public.get_latest_agent_metrics(p_tenant_id uuid)
RETURNS TABLE(agent_id uuid, agent_name text, os_type text, os_version text, hostname text, status text, last_heartbeat timestamptz, cpu_usage_percent numeric, memory_usage_percent numeric, disk_usage_percent numeric, uptime_seconds bigint, metrics_age_minutes integer, agent_version text)
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);
  RETURN QUERY
  SELECT DISTINCT ON (a.id)
    a.id, a.agent_name, a.os_type, a.os_version, a.hostname, a.status, a.last_heartbeat,
    m.cpu_usage_percent, m.memory_usage_percent, m.disk_usage_percent, m.uptime_seconds,
    EXTRACT(EPOCH FROM (now() - m.collected_at))::integer / 60,
    a.agent_version
  FROM agents a
  LEFT JOIN agent_system_metrics_partitioned m ON a.id = m.agent_id
  WHERE a.tenant_id = p_tenant_id AND a.archived_at IS NULL
  ORDER BY a.id, m.collected_at DESC NULLS LAST;
END;
$function$;

-- 6. get_agents_snapshots_list (already has SOME check, but not _assert_caller_tenant)
CREATE OR REPLACE FUNCTION public.get_agents_snapshots_list(p_tenant_id uuid DEFAULT NULL::uuid)
RETURNS SETOF jsonb
LANGUAGE plpgsql STABLE SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_effective_tenant_id uuid;
BEGIN
  -- For this function, p_tenant_id can be NULL (fallback to JWT)
  v_effective_tenant_id := COALESCE(p_tenant_id, get_active_tenant_id());
  
  IF v_effective_tenant_id IS NOT NULL AND NOT is_current_super_admin() THEN
    PERFORM public._assert_caller_tenant(v_effective_tenant_id);
  END IF;
  
  RETURN QUERY
  SELECT jsonb_build_object(
    'agent_id', a.id, 'tenant_id', a.tenant_id, 'hostname', a.hostname,
    'os_type', a.os_type, 'version', a.agent_version, 'last_heartbeat', a.last_heartbeat,
    'online', a.last_heartbeat > (now() - interval '2 minutes'),
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
    AND (
      a.tenant_id = v_effective_tenant_id
      OR (v_effective_tenant_id IS NULL AND EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND ur.tenant_id = a.tenant_id
      ))
      OR is_current_super_admin()
    );
END;
$function$;
