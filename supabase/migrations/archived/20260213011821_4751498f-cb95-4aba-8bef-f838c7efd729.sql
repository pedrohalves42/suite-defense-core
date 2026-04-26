-- ============================================================
-- FIX: run_system_maintenance() - resolved_by is UUID but receives text
-- Solution: Drop ALL dependent views, alter column, recreate views
-- ============================================================

-- Step 1: Drop ALL dependent views
DROP VIEW IF EXISTS public.v_dlq_risk_overview;
DROP VIEW IF EXISTS public.dlq_categorized;

-- Step 2: Change resolved_by from UUID to TEXT
ALTER TABLE public.failed_jobs_dlq 
  ALTER COLUMN resolved_by TYPE text USING resolved_by::text;

-- Step 3: Recreate dlq_categorized view
CREATE OR REPLACE VIEW public.dlq_categorized 
WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
    tenant_id,
    agent_id,
    job_type,
    error_message,
    retry_count,
    status,
    created_at,
    resolved_at,
    resolved_by,
    review_notes,
    flagged_suspicious,
    COALESCE(risk_category,
        CASE
            WHEN failure_class = ANY (ARRAY['security', 'critical', 'auth_failure']) THEN 'security'
            WHEN retry_count > 5 THEN 'reliability'
            ELSE 'operational'
        END) AS risk_category
FROM failed_jobs_dlq
WHERE auth.uid() IS NOT NULL AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

-- Step 4: Recreate v_dlq_risk_overview view
CREATE OR REPLACE VIEW public.v_dlq_risk_overview 
WITH (security_invoker = on, security_barrier = true) AS
SELECT tenant_id,
    count(*) AS total_items,
    count(*) FILTER (WHERE status = 'resolved') AS resolved_items,
    count(*) FILTER (WHERE resolved_by IS NOT NULL) AS manually_reviewed,
    count(*) FILTER (WHERE flagged_suspicious) AS suspicious_items,
    count(*) FILTER (WHERE created_at < (now() - interval '24 hours') AND status <> 'resolved') AS overdue_items,
    round(
        CASE
            WHEN count(*) > 0 THEN count(*) FILTER (WHERE resolved_by IS NOT NULL)::numeric / count(*)::numeric * 100
            ELSE 0
        END, 2) AS review_rate_pct
FROM failed_jobs_dlq
WHERE created_at > (now() - interval '30 days') 
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id;