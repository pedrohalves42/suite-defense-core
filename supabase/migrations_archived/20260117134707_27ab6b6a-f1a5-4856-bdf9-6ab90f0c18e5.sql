-- =============================================================================
-- ADR-026 Phase 3: Remaining View Hardening (Dr. Vellum Audit)
-- =============================================================================
-- Harden additional views with tenant isolation
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 3.7 HARDEN v_jobs_status_corrected VIEW
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_jobs_status_corrected' AND schemaname = 'public') THEN
    DROP VIEW public.v_jobs_status_corrected CASCADE;
    
    CREATE VIEW public.v_jobs_status_corrected
    WITH (security_invoker = on)
    AS
    SELECT 
      j.id,
      j.tenant_id,
      j.agent_id,
      j.type,
      CASE
        WHEN j.status = 'delivered' AND j.created_at < (now() - interval '2 hours') THEN 'stuck'
        WHEN j.status = 'queued' AND j.created_at < (now() - interval '1 hour') THEN 'stale'
        ELSE j.status
      END AS corrected_status,
      j.status AS original_status,
      j.created_at,
      j.completed_at,
      j.error_message
    FROM public.jobs j
    WHERE 
      auth.uid() IS NOT NULL 
      AND (j.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());
      
    COMMENT ON VIEW public.v_jobs_status_corrected IS 
      'ADR-026: Hardened with security_invoker and active tenant isolation.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3.8 HARDEN v_job_metrics_by_type VIEW
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_job_metrics_by_type' AND schemaname = 'public') THEN
    DROP VIEW public.v_job_metrics_by_type CASCADE;
    
    CREATE VIEW public.v_job_metrics_by_type
    WITH (security_invoker = on)
    AS
    SELECT 
      j.tenant_id,
      j.type,
      COUNT(*) as total_count,
      COUNT(*) FILTER (WHERE j.status = 'completed') as completed_count,
      COUNT(*) FILTER (WHERE j.status = 'failed') as failed_count,
      AVG(EXTRACT(epoch FROM (j.completed_at - j.created_at))) FILTER (WHERE j.completed_at IS NOT NULL) as avg_duration_seconds
    FROM public.jobs j
    WHERE 
      auth.uid() IS NOT NULL 
      AND j.created_at > now() - interval '30 days'
      AND (j.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
    GROUP BY j.tenant_id, j.type;
      
    COMMENT ON VIEW public.v_job_metrics_by_type IS 
      'ADR-026: Hardened with security_invoker and active tenant isolation.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3.9 HARDEN v_confidence_gap_trend VIEW
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_confidence_gap_trend' AND schemaname = 'public') THEN
    DROP VIEW public.v_confidence_gap_trend CASCADE;
    
    CREATE VIEW public.v_confidence_gap_trend
    WITH (security_invoker = on)
    AS
    SELECT 
      cg.id,
      cg.tenant_id,
      cg.audit_id,
      cg.red_team_id,
      cg.ana_score,
      cg.red_score,
      cg.confidence_gap,
      cg.health_status,
      cg.previous_gap,
      cg.gap_delta,
      cg.alert_triggered,
      cg.alert_reason,
      cg.dimension_gaps,
      cg.created_at,
      LAG(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at) AS prev_gap,
      AVG(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at ROWS BETWEEN 30 PRECEDING AND CURRENT ROW) AS avg_gap_30d,
      AVG(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at ROWS BETWEEN 90 PRECEDING AND CURRENT ROW) AS avg_gap_90d,
      CASE
        WHEN cg.confidence_gap < LAG(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at)
        THEN true
        ELSE false
      END AS is_improving
    FROM public.audit_confidence_gaps cg
    WHERE 
      auth.uid() IS NOT NULL 
      AND (cg.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());
      
    COMMENT ON VIEW public.v_confidence_gap_trend IS 
      'ADR-026: Hardened with security_invoker and active tenant isolation.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3.10 HARDEN v_tasks_requiring_closure VIEW
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_tasks_requiring_closure' AND schemaname = 'public') THEN
    DROP VIEW public.v_tasks_requiring_closure CASCADE;
    
    CREATE VIEW public.v_tasks_requiring_closure
    WITH (security_invoker = on)
    AS
    SELECT 
      t.*
    FROM public.tasks t
    WHERE 
      auth.uid() IS NOT NULL 
      AND t.status NOT IN ('resolved', 'ignored', 'closed')
      AND (t.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());
      
    COMMENT ON VIEW public.v_tasks_requiring_closure IS 
      'ADR-026: Hardened with security_invoker and active tenant isolation.';
  END IF;
END $$;

-- -----------------------------------------------------------------------------
-- 3.11 HARDEN v_tenant_isolation_metrics VIEW
-- -----------------------------------------------------------------------------
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'v_tenant_isolation_metrics' AND schemaname = 'public') THEN
    DROP VIEW public.v_tenant_isolation_metrics CASCADE;
    
    CREATE VIEW public.v_tenant_isolation_metrics
    WITH (security_invoker = on)
    AS
    SELECT 
      t.id as tenant_id,
      t.name as tenant_name,
      (SELECT COUNT(*) FROM public.agents a WHERE a.tenant_id = t.id AND a.archived_at IS NULL) as agent_count,
      (SELECT COUNT(*) FROM public.jobs j WHERE j.tenant_id = t.id) as job_count,
      (SELECT COUNT(*) FROM public.user_roles ur WHERE ur.tenant_id = t.id) as user_count
    FROM public.tenants t
    WHERE 
      auth.uid() IS NOT NULL 
      AND (t.id = public.get_active_tenant_id() OR public.is_current_super_admin());
      
    COMMENT ON VIEW public.v_tenant_isolation_metrics IS 
      'ADR-026: Hardened with security_invoker and active tenant isolation.';
  END IF;
END $$;