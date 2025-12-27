-- Fix security definer view warning by using SECURITY INVOKER explicitly
DROP VIEW IF EXISTS agents_health_view;

CREATE VIEW agents_health_view 
WITH (security_invoker = true) AS
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