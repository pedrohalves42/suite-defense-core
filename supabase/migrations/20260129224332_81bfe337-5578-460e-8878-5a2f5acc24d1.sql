-- =====================================================
-- Migration: Fix RPCs to query agents table directly
-- 
-- This migration updates get_latest_agent_metrics and
-- get_agent_health_metrics to query the base 'agents' table
-- instead of the 'active_agents' view.
--
-- Reason: The active_agents view depends on get_active_tenant_id()
-- which requires JWT claims. When edge functions call these RPCs
-- with service role (no JWT claims), the view returns 0 rows.
-- By querying agents directly with explicit p_tenant_id filter,
-- both frontend (authenticated user) and backend (service role)
-- calls work correctly.
-- =====================================================

-- B1) Drop and recreate get_latest_agent_metrics to use agents table directly
DROP FUNCTION IF EXISTS public.get_latest_agent_metrics(uuid);

CREATE OR REPLACE FUNCTION public.get_latest_agent_metrics(p_tenant_id uuid)
RETURNS TABLE (
  agent_id uuid,
  agent_name text,
  os_type text,
  os_version text,
  hostname text,
  status text,
  last_heartbeat timestamptz,
  cpu_usage_percent numeric,
  memory_usage_percent numeric,
  disk_usage_percent numeric,
  uptime_seconds bigint,
  metrics_age_minutes integer
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT DISTINCT ON (a.id)
    a.id as agent_id,
    a.agent_name,
    a.os_type,
    a.os_version,
    a.hostname,
    a.status,
    a.last_heartbeat,
    m.cpu_usage_percent,
    m.memory_usage_percent,
    m.disk_usage_percent,
    m.uptime_seconds,
    EXTRACT(EPOCH FROM (now() - m.collected_at))::integer / 60 as metrics_age_minutes
  FROM agents a
  LEFT JOIN agent_system_metrics_partitioned m ON a.id = m.agent_id
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL
  ORDER BY a.id, m.collected_at DESC NULLS LAST;
$$;

-- B2) Drop and recreate get_agent_health_metrics to use agents table directly
DROP FUNCTION IF EXISTS public.get_agent_health_metrics(uuid);

CREATE OR REPLACE FUNCTION public.get_agent_health_metrics(p_tenant_id uuid)
RETURNS TABLE (
  id uuid,
  agent_name text,
  hostname text,
  os_type text,
  os_version text,
  agent_version text,
  status text,
  last_heartbeat timestamptz,
  enrolled_at timestamptz,
  health_status text,
  seconds_since_heartbeat integer,
  is_throttled boolean,
  throttle_reason text,
  is_isolated boolean,
  isolation_reason text,
  is_in_safe_mode boolean,
  safe_mode_reason text,
  has_critical_alerts boolean
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
BEGIN
  RETURN QUERY
  SELECT 
    a.id,
    a.agent_name,
    a.hostname,
    a.os_type,
    a.os_version,
    a.agent_version,
    a.status,
    a.last_heartbeat,
    a.enrolled_at,
    CASE
      WHEN a.last_heartbeat IS NULL THEN 'never_connected'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN 'offline'::TEXT
      WHEN EXISTS (
        SELECT 1 FROM system_alerts sa 
        WHERE sa.agent_id = a.id 
        AND sa.resolved = false 
        AND sa.severity IN ('critical', 'high')
      ) THEN 'critical'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'critical'::TEXT
      ELSE 'healthy'::TEXT
    END AS health_status,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER AS seconds_since_heartbeat,
    COALESCE(a.is_throttled, false) AS is_throttled,
    a.throttle_reason,
    COALESCE(a.is_isolated, false) AS is_isolated,
    a.isolation_reason,
    (a.safe_mode_entered_at IS NOT NULL) AS is_in_safe_mode,
    a.safe_mode_reason,
    EXISTS (
      SELECT 1 FROM system_alerts sa 
      WHERE sa.agent_id = a.id 
      AND sa.resolved = false 
      AND sa.severity IN ('critical', 'high')
    ) AS has_critical_alerts
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL
  ORDER BY a.agent_name;
END;
$function$;

-- Grant execute permissions
GRANT EXECUTE ON FUNCTION public.get_latest_agent_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_latest_agent_metrics(uuid) TO service_role;
GRANT EXECUTE ON FUNCTION public.get_agent_health_metrics(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.get_agent_health_metrics(uuid) TO service_role;

-- Add comments for documentation
COMMENT ON FUNCTION public.get_latest_agent_metrics(uuid) IS 
'Returns latest metrics for all non-archived agents in a tenant. 
Queries agents table directly to work with both authenticated users and service role calls.';

COMMENT ON FUNCTION public.get_agent_health_metrics(uuid) IS 
'Returns health status for all non-archived agents in a tenant.
Queries agents table directly to work with both authenticated users and service role calls.';