
-- RPC: get_tenant_cost_metrics (Super Admin only)
CREATE OR REPLACE FUNCTION public.get_tenant_cost_metrics()
RETURNS TABLE (
  tenant_id uuid,
  tenant_name text,
  tenant_plan text,
  active_agents bigint,
  agent_limit int,
  jobs_24h bigint,
  jobs_7d bigint,
  jobs_30d bigint,
  failed_jobs_24h bigint,
  abuse_alerts_7d bigint,
  estimated_monthly_cost numeric
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate super_admin
  IF NOT public.is_super_admin(auth.uid()) THEN
    RAISE EXCEPTION 'Access denied: super_admin role required';
  END IF;

  RETURN QUERY
  SELECT
    t.id AS tenant_id,
    t.name AS tenant_name,
    COALESCE(ts.plan_type, 'free') AS tenant_plan,
    (SELECT count(*) FROM agents a WHERE a.tenant_id = t.id AND a.status = 'active' AND COALESCE(a.is_archived, false) = false) AS active_agents,
    COALESCE(ts.agent_limit, 2) AS agent_limit,
    (SELECT count(*) FROM jobs j WHERE j.tenant_id = t.id AND j.created_at >= now() - interval '24 hours') AS jobs_24h,
    (SELECT count(*) FROM jobs j WHERE j.tenant_id = t.id AND j.created_at >= now() - interval '7 days') AS jobs_7d,
    (SELECT count(*) FROM jobs j WHERE j.tenant_id = t.id AND j.created_at >= now() - interval '30 days') AS jobs_30d,
    (SELECT count(*) FROM jobs j WHERE j.tenant_id = t.id AND j.status = 'failed' AND j.created_at >= now() - interval '24 hours') AS failed_jobs_24h,
    (SELECT count(*) FROM system_alerts sa WHERE sa.tenant_id = t.id AND sa.alert_type LIKE '%abuse%' AND sa.created_at >= now() - interval '7 days') AS abuse_alerts_7d,
    -- Estimated cost: base $5 + $0.50/agent + $0.001/job
    (5.0 + 
     (SELECT count(*) FROM agents a2 WHERE a2.tenant_id = t.id AND a2.status = 'active') * 0.50 +
     (SELECT count(*) FROM jobs j2 WHERE j2.tenant_id = t.id AND j2.created_at >= now() - interval '30 days') * 0.001
    )::numeric(10,2) AS estimated_monthly_cost
  FROM tenants t
  LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id
  ORDER BY jobs_30d DESC;
END;
$$;
