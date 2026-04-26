
-- Fix get_agent_health_metrics: online agents should NOT be marked critical just for old alerts
-- health_status should reflect connectivity; has_critical_alerts remains as separate flag
CREATE OR REPLACE FUNCTION public.get_agent_health_metrics(p_tenant_id UUID)
RETURNS TABLE(
  id UUID,
  agent_name TEXT,
  hostname TEXT,
  os_type TEXT,
  os_version TEXT,
  agent_version TEXT,
  status TEXT,
  last_heartbeat TIMESTAMPTZ,
  enrolled_at TIMESTAMPTZ,
  health_status TEXT,
  seconds_since_heartbeat INTEGER,
  is_throttled BOOLEAN,
  throttle_reason TEXT,
  is_isolated BOOLEAN,
  isolation_reason TEXT,
  is_in_safe_mode BOOLEAN,
  safe_mode_reason TEXT,
  has_critical_alerts BOOLEAN
)
LANGUAGE plpgsql SECURITY DEFINER
SET search_path = public
AS $$
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
    -- health_status: based on heartbeat ONLY (connectivity)
    -- has_critical_alerts is a SEPARATE indicator for UI badges
    CASE
      WHEN a.last_heartbeat IS NULL THEN 'never_connected'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN 'offline'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '2 minutes' THEN 'warning'::TEXT
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
    AND a.status != 'archived'
  ORDER BY a.agent_name;
END;
$$;
