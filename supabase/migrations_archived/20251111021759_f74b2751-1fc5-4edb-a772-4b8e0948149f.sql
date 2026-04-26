-- Fix search_path for security functions
CREATE OR REPLACE FUNCTION cleanup_old_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM agent_system_metrics
  WHERE collected_at < NOW() - INTERVAL '30 days';
END;
$$;

CREATE OR REPLACE FUNCTION get_latest_agent_metrics(p_tenant_id UUID)
RETURNS TABLE (
  agent_id UUID,
  agent_name TEXT,
  os_type TEXT,
  os_version TEXT,
  hostname TEXT,
  status TEXT,
  last_heartbeat TIMESTAMPTZ,
  cpu_usage_percent DECIMAL,
  memory_usage_percent DECIMAL,
  disk_usage_percent DECIMAL,
  uptime_seconds BIGINT,
  metrics_age_minutes INTEGER
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT DISTINCT ON (a.id)
    a.id,
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
    EXTRACT(EPOCH FROM (NOW() - m.collected_at))::INTEGER / 60 AS metrics_age_minutes
  FROM agents a
  LEFT JOIN agent_system_metrics m ON a.id = m.agent_id
  WHERE a.tenant_id = p_tenant_id
  ORDER BY a.id, m.collected_at DESC NULLS LAST;
END;
$$;