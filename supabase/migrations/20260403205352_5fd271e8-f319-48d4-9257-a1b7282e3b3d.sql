
-- Function to check if an agent has high failure rate for a specific job type
CREATE OR REPLACE FUNCTION public.check_agent_job_failure_rate(
  p_agent_id UUID,
  p_job_type TEXT,
  p_days_back INT DEFAULT 7,
  p_threshold NUMERIC DEFAULT 50.0
)
RETURNS TABLE(
  total_jobs INT,
  failed_jobs INT,
  failure_rate NUMERIC,
  should_skip BOOLEAN
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  WITH stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status IN ('completed', 'failed')) AS total,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed
    FROM jobs
    WHERE agent_id = p_agent_id
      AND type = p_job_type
      AND created_at > now() - make_interval(days => p_days_back)
  )
  SELECT
    s.total::INT AS total_jobs,
    s.failed::INT AS failed_jobs,
    CASE WHEN s.total > 0 THEN ROUND((s.failed::NUMERIC / s.total) * 100, 1) ELSE 0 END AS failure_rate,
    CASE WHEN s.total >= 3 AND (s.failed::NUMERIC / NULLIF(s.total, 0)) * 100 > p_threshold THEN TRUE ELSE FALSE END AS should_skip
  FROM stats s;
$$;

-- Function to get failure stats for admin dashboard
CREATE OR REPLACE FUNCTION public.get_job_failure_stats(
  p_tenant_id UUID,
  p_days_back INT DEFAULT 30,
  p_group_by_agent BOOLEAN DEFAULT FALSE
)
RETURNS TABLE(
  job_type TEXT,
  agent_name TEXT,
  agent_id UUID,
  total_jobs BIGINT,
  completed_jobs BIGINT,
  failed_jobs BIGINT,
  failure_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  SELECT
    j.type AS job_type,
    CASE WHEN p_group_by_agent THEN j.agent_name ELSE NULL END AS agent_name,
    CASE WHEN p_group_by_agent THEN j.agent_id ELSE NULL END AS agent_id,
    COUNT(*) FILTER (WHERE j.status IN ('completed', 'failed')) AS total_jobs,
    COUNT(*) FILTER (WHERE j.status = 'completed') AS completed_jobs,
    COUNT(*) FILTER (WHERE j.status = 'failed') AS failed_jobs,
    CASE 
      WHEN COUNT(*) FILTER (WHERE j.status IN ('completed', 'failed')) > 0 
      THEN ROUND(
        COUNT(*) FILTER (WHERE j.status = 'failed')::NUMERIC / 
        COUNT(*) FILTER (WHERE j.status IN ('completed', 'failed')) * 100, 1
      )
      ELSE 0 
    END AS failure_rate
  FROM jobs j
  WHERE j.tenant_id = p_tenant_id
    AND j.created_at > now() - make_interval(days => p_days_back)
  GROUP BY j.type,
    CASE WHEN p_group_by_agent THEN j.agent_name ELSE NULL END,
    CASE WHEN p_group_by_agent THEN j.agent_id ELSE NULL END
  ORDER BY failure_rate DESC, total_jobs DESC;
$$;

-- Index to speed up failure rate lookups
CREATE INDEX IF NOT EXISTS idx_jobs_agent_type_status_created
ON jobs (agent_id, type, status, created_at DESC);
