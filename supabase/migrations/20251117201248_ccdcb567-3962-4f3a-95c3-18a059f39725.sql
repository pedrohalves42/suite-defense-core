-- FASE 3: Criar funcao para calcular saude real dos agentes
CREATE OR REPLACE FUNCTION get_agent_health_metrics(p_tenant_id UUID)
RETURNS TABLE (
  agent_name TEXT,
  health_status TEXT,
  last_heartbeat TIMESTAMPTZ,
  seconds_since_heartbeat INTEGER,
  total_jobs_24h INTEGER,
  failed_jobs_24h INTEGER,
  failure_rate_pct NUMERIC,
  hostname TEXT,
  os_type TEXT,
  os_version TEXT,
  agent_version TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  RETURN QUERY
  SELECT
    a.agent_name,
    CASE
      WHEN a.last_heartbeat IS NULL THEN 'never_connected'
      WHEN a.last_heartbeat < now() - interval '5 minutes' THEN 'offline'
      WHEN COALESCE(j.failed_jobs, 0)::float / NULLIF(j.total_jobs, 0) > 0.3 THEN 'critical'
      ELSE 'healthy'
    END AS health_status,
    a.last_heartbeat,
    CASE 
      WHEN a.last_heartbeat IS NULL THEN NULL
      ELSE EXTRACT(EPOCH FROM (now() - a.last_heartbeat))::INTEGER
    END AS seconds_since_heartbeat,
    COALESCE(j.total_jobs, 0)::INTEGER AS total_jobs_24h,
    COALESCE(j.failed_jobs, 0)::INTEGER AS failed_jobs_24h,
    CASE
      WHEN j.total_jobs > 0
      THEN ROUND((j.failed_jobs::numeric / j.total_jobs::numeric) * 100, 1)
      ELSE 0
    END AS failure_rate_pct,
    a.hostname,
    a.os_type,
    a.os_version,
    a.agent_version
  FROM agents a
  LEFT JOIN LATERAL (
    SELECT
      COUNT(*) AS total_jobs,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed_jobs
    FROM jobs
    WHERE jobs.agent_name = a.agent_name
      AND jobs.created_at > now() - interval '1 day'
  ) j ON TRUE
  WHERE a.tenant_id = p_tenant_id
  ORDER BY
    CASE
      WHEN a.last_heartbeat IS NULL THEN 0
      WHEN a.last_heartbeat < now() - interval '5 minutes' THEN 1
      WHEN COALESCE(j.failed_jobs, 0)::float / NULLIF(j.total_jobs, 0) > 0.3 THEN 2
      ELSE 3
    END,
    a.agent_name;
END;
$$;