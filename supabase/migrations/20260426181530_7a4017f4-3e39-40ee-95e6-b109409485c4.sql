-- Function to get installation health for multiple tenants at once
CREATE OR REPLACE FUNCTION public.get_installation_health_batch(p_tenant_ids UUID[])
RETURNS TABLE (
    tenant_id UUID,
    failure_rate_pct NUMERIC,
    threshold NUMERIC,
    total_attempts BIGINT,
    failed_attempts BIGINT
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH stats AS (
        SELECT 
            t.id as t_id,
            COUNT(ia.id) as total,
            COUNT(ia.id) FILTER (WHERE ia.status = 'failed') as failed
        FROM unnest(p_tenant_ids) t_id
        JOIN tenants t ON t.id = t_id
        LEFT JOIN installation_analytics ia ON ia.tenant_id = t.id AND ia.created_at > now() - interval '24 hours'
        GROUP BY t.id
    )
    SELECT 
        s.t_id,
        CASE WHEN s.total > 0 THEN (s.failed::NUMERIC / s.total::NUMERIC) * 100 ELSE 0 END as failure_rate_pct,
        COALESCE((ts.business_hours->>'installation_failure_threshold')::NUMERIC, 30.0) as threshold,
        s.total,
        s.failed
    FROM stats s
    LEFT JOIN tenant_settings ts ON ts.tenant_id = s.t_id;
END;
$$;

-- Function to get compliance scores for all active tenants in one go
CREATE OR REPLACE FUNCTION public.get_tenants_compliance_scores()
RETURNS TABLE (
    tenant_id UUID,
    overall_score NUMERIC,
    category_scores JSONB
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    WITH active_tenants AS (
        SELECT DISTINCT ts.tenant_id 
        FROM tenant_subscriptions ts 
        WHERE ts.status IN ('active', 'trialing')
    ),
    agent_stats AS (
        SELECT 
            a.tenant_id,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE a.status = 'active') as active
        FROM agents a
        WHERE a.tenant_id IN (SELECT t_id FROM active_tenants)
        GROUP BY a.tenant_id
    ),
    alert_stats AS (
        SELECT 
            sa.tenant_id,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE sa.acknowledged) as acknowledged
        FROM system_alerts sa
        WHERE sa.tenant_id IN (SELECT t_id FROM active_tenants)
        GROUP BY sa.tenant_id
    ),
    job_stats AS (
        SELECT 
            j.tenant_id,
            COUNT(*) as total,
            COUNT(*) FILTER (WHERE j.status = 'completed') as completed
        FROM jobs j
        WHERE j.tenant_id IN (SELECT t_id FROM active_tenants)
        GROUP BY j.tenant_id
    ),
    evidence_stats AS (
        SELECT 
            ael.tenant_id,
            COUNT(*) as total
        FROM agent_evidence_logs ael
        WHERE ael.tenant_id IN (SELECT t_id FROM active_tenants)
        GROUP BY ael.tenant_id
    ),
    threat_info AS (
        SELECT COUNT(*) as total FROM threat_indicators WHERE is_active = true
    )
    SELECT 
        at.tenant_id,
        (
            COALESCE(CASE WHEN ast.total > 0 THEN (ast.active::NUMERIC / ast.total::NUMERIC) * 100 ELSE 0 END, 0) * 0.25 +
            COALESCE(CASE WHEN alst.total > 0 THEN (alst.acknowledged::NUMERIC / alst.total::NUMERIC) * 100 ELSE 100 END, 100) * 0.20 +
            COALESCE(CASE WHEN jst.total > 0 THEN (jst.completed::NUMERIC / jst.total::NUMERIC) * 100 ELSE 0 END, 0) * 0.20 +
            LEAST(100, (COALESCE(est.total, 0)::NUMERIC / 50.0) * 100) * 0.20 +
            (CASE WHEN ti.total > 0 THEN 100 ELSE 0 END) * 0.15
        )::NUMERIC as overall_score,
        jsonb_build_object(
            'agent_coverage', COALESCE(CASE WHEN ast.total > 0 THEN (ast.active::NUMERIC / ast.total::NUMERIC) * 100 ELSE 0 END, 0),
            'alert_response', COALESCE(CASE WHEN alst.total > 0 THEN (alst.acknowledged::NUMERIC / alst.total::NUMERIC) * 100 ELSE 100 END, 100),
            'job_reliability', COALESCE(CASE WHEN jst.total > 0 THEN (jst.completed::NUMERIC / jst.total::NUMERIC) * 100 ELSE 0 END, 0),
            'evidence_coverage', LEAST(100, (COALESCE(est.total, 0)::NUMERIC / 50.0) * 100),
            'threat_intelligence', (CASE WHEN ti.total > 0 THEN 100 ELSE 0 END)
        ) as category_scores
    FROM active_tenants at
    LEFT JOIN agent_stats ast ON ast.tenant_id = at.tenant_id
    LEFT JOIN alert_stats alst ON alst.tenant_id = at.tenant_id
    LEFT JOIN job_stats jst ON jst.tenant_id = at.tenant_id
    LEFT JOIN evidence_stats est ON est.tenant_id = at.tenant_id
    CROSS JOIN threat_info ti;
END;
$$;

-- Function to get business hours for multiple tenants
CREATE OR REPLACE FUNCTION public.get_business_hours_batch(p_tenant_ids UUID[])
RETURNS TABLE (
    tenant_id UUID,
    business_hours JSONB
) LANGUAGE plpgsql AS $$
BEGIN
    RETURN QUERY
    SELECT ts.tenant_id, ts.business_hours
    FROM tenant_settings ts
    WHERE ts.tenant_id = ANY(p_tenant_ids);
END;
$$;
