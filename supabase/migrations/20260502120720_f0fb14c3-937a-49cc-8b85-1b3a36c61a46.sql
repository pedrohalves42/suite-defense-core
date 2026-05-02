-- Create a function to efficiently get abuse metrics for all active tenants in one query
CREATE OR REPLACE FUNCTION public.get_tenant_abuse_metrics(
  job_threshold INTEGER,
  failed_auth_threshold INTEGER,
  agent_overflow_ratio FLOAT,
  lookback_interval INTERVAL DEFAULT INTERVAL '1 hour'
)
RETURNS TABLE (
  tenant_id UUID,
  tenant_name TEXT,
  abuse_type TEXT,
  current_value BIGINT,
  threshold FLOAT,
  severity TEXT
) LANGUAGE plpgsql SECURITY DEFINER AS $$
BEGIN
  RETURN QUERY
  WITH tenant_list AS (
    SELECT t.id, t.name
    FROM public.tenants t
    WHERE t.suspension_status = 'active'
  ),
  job_stats AS (
    SELECT j.tenant_id, count(*) as cnt
    FROM public.jobs j
    WHERE j.created_at >= (now() - lookback_interval)
    GROUP BY j.tenant_id
  ),
  auth_stats AS (
    SELECT f.tenant_id, count(*) as cnt
    FROM public.failed_login_attempts f
    WHERE f.attempted_at >= (now() - lookback_interval)
    GROUP BY f.tenant_id
  ),
  agent_stats AS (
    SELECT a.tenant_id, count(*) as cnt
    FROM public.agents a
    WHERE a.status = 'active'
    GROUP BY a.tenant_id
  ),
  subscription_stats AS (
    SELECT ts.tenant_id, ts.agent_limit
    FROM public.tenant_subscriptions ts
  )
  -- Excessive Jobs
  SELECT 
    tl.id, tl.name, 'excessive_jobs'::TEXT, js.cnt, job_threshold::FLOAT, 'warning'::TEXT
  FROM tenant_list tl
  JOIN job_stats js ON tl.id = js.tenant_id
  WHERE js.cnt > job_threshold

  UNION ALL

  -- Brute Force Suspected
  SELECT 
    tl.id, tl.name, 'brute_force_suspected'::TEXT, as_stats.cnt, failed_auth_threshold::FLOAT, 'critical'::TEXT
  FROM tenant_list tl
  JOIN auth_stats as_stats ON tl.id = as_stats.tenant_id
  WHERE as_stats.cnt > failed_auth_threshold

  UNION ALL

  -- Agent Limit Exceeded
  SELECT 
    tl.id, tl.name, 'agent_limit_exceeded'::TEXT, ags.cnt, ceil(COALESCE(ss.agent_limit, 2) * agent_overflow_ratio)::FLOAT, 'warning'::TEXT
  FROM tenant_list tl
  JOIN agent_stats ags ON tl.id = ags.tenant_id
  LEFT JOIN subscription_stats ss ON tl.id = ss.tenant_id
  WHERE ags.cnt > (COALESCE(ss.agent_limit, 2) * agent_overflow_ratio);
END;
$$;