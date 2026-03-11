CREATE OR REPLACE FUNCTION public.get_agent_health_metrics(p_tenant_id uuid)
RETURNS TABLE(
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
SET search_path TO 'public'
AS $$
BEGIN
  PERFORM public._assert_caller_tenant(p_tenant_id);

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
      WHEN a.last_heartbeat IS NULL THEN 'never_connected'::text
      WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'offline'::text
      WHEN a.last_heartbeat < NOW() - INTERVAL '12 minutes' THEN 'warning'::text
      ELSE 'healthy'::text
    END AS health_status,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::integer AS seconds_since_heartbeat,
    COALESCE(a.is_throttled, false) AS is_throttled,
    a.throttle_reason,
    COALESCE(a.is_isolated, false) AS is_isolated,
    a.isolation_reason,
    (a.safe_mode_entered_at IS NOT NULL) AS is_in_safe_mode,
    a.safe_mode_reason,
    EXISTS (
      SELECT 1
      FROM system_alerts sa
      WHERE sa.agent_id = a.id
        AND sa.resolved = false
        AND sa.severity IN ('critical', 'high')
    ) AS has_critical_alerts
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
    AND a.archived_at IS NULL
    AND a.status != 'archived'
  ORDER BY a.agent_name;
END;
$$;