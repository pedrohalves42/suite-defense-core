-- First drop the existing function
DROP FUNCTION IF EXISTS get_agent_health_metrics(UUID);

-- Drop and recreate agents_health_view to include Rules Engine fields
DROP VIEW IF EXISTS agents_health_view;

CREATE VIEW agents_health_view AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.os_type,
  a.os_version,
  a.agent_version,
  a.status,
  a.last_heartbeat,
  a.tenant_id,
  a.enrolled_at,
  -- Rules Engine status fields
  a.is_throttled,
  a.throttle_reason,
  a.throttled_at,
  a.is_isolated,
  a.isolation_reason,
  a.isolated_at,
  a.safe_mode_entered_at,
  a.safe_mode_reason,
  -- Calculated health status
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'critical'
    ELSE 'healthy'
  END AS health_status,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER AS seconds_since_heartbeat
FROM agents a;

-- Recreate the function with additional Rules Engine fields
CREATE FUNCTION get_agent_health_metrics(p_tenant_id UUID)
RETURNS TABLE (
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
  safe_mode_reason TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
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
    CASE
      WHEN a.last_heartbeat IS NULL THEN 'never_connected'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '10 minutes' THEN 'offline'::TEXT
      WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'critical'::TEXT
      ELSE 'healthy'::TEXT
    END AS health_status,
    EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER AS seconds_since_heartbeat,
    COALESCE(a.is_throttled, false) AS is_throttled,
    a.throttle_reason,
    COALESCE(a.is_isolated, false) AS is_isolated,
    a.isolation_reason,
    (a.safe_mode_entered_at IS NOT NULL) AS is_in_safe_mode,
    a.safe_mode_reason
  FROM agents a
  WHERE a.tenant_id = p_tenant_id
  ORDER BY a.agent_name;
END;
$$;