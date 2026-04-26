-- =============================================================================
-- Migration: Create Enforcement Compliance Metrics (FIXED)
-- Purpose: Provide temporal-aware compliance metrics that separate pre/post-enforcement data
-- ADR: ADR-012 - Fechamento dos Ciclos de Governanca Operacional
-- =============================================================================

-- 1. Create the enforcement compliance view
CREATE OR REPLACE VIEW public.v_enforcement_compliance AS
WITH 
  -- Cutoff date: when enforcement triggers were activated
  enforcement_cutoff AS (
    SELECT '2026-01-03 19:31:58+00'::timestamptz AS cutoff_date
  ),
  
  -- AI Actions metrics (post-migration only)
  ai_actions_metrics AS (
    SELECT 
      COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical')) as total_high_critical,
      COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical') AND approved_at IS NOT NULL) as with_formal_approval,
      COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical') AND approval_request_id IS NOT NULL) as with_approval_request
    FROM ai_actions, enforcement_cutoff
    WHERE created_at >= cutoff_date
  ),
  
  -- Critical Alerts metrics (post-migration only) - FIXED: use created_at instead of updated_at
  critical_alerts_metrics AS (
    SELECT 
      COUNT(*) as total_critical,
      COUNT(*) FILTER (WHERE resolved = true) as resolved,
      COUNT(*) FILTER (WHERE resolved = true AND resolved_by IS NOT NULL) as resolved_by_human,
      COUNT(*) FILTER (WHERE resolved = true AND decision_event_id IS NOT NULL) as with_decision_event
    FROM system_alerts, enforcement_cutoff
    WHERE severity = 'critical' AND created_at >= cutoff_date
  ),
  
  -- DLQ metrics (post-migration only)
  dlq_metrics AS (
    SELECT 
      COUNT(*) as total_resolved,
      COUNT(*) FILTER (WHERE decision_event_id IS NOT NULL) as with_decision_event,
      COUNT(*) FILTER (WHERE resolution_source IS NOT NULL) as with_resolution_source
    FROM failed_jobs_dlq, enforcement_cutoff
    WHERE status = 'resolved' AND resolved_at >= cutoff_date
  ),
  
  -- Legacy metrics (for transparency - data before enforcement) - FIXED: use created_at
  legacy_metrics AS (
    SELECT 
      (SELECT COUNT(*) FROM system_alerts WHERE severity = 'critical' AND resolved = true AND created_at < (SELECT cutoff_date FROM enforcement_cutoff)) as legacy_critical_alerts,
      (SELECT COUNT(*) FROM failed_jobs_dlq WHERE status = 'resolved' AND resolved_at < (SELECT cutoff_date FROM enforcement_cutoff)) as legacy_dlq_resolved
  )

SELECT 
  -- Enforcement cutoff timestamp
  (SELECT cutoff_date FROM enforcement_cutoff) as enforcement_active_since,
  
  -- AI Actions compliance
  a.total_high_critical as ai_actions_high_critical,
  a.with_formal_approval as ai_actions_with_approval,
  a.with_approval_request as ai_actions_with_request,
  CASE 
    WHEN a.total_high_critical = 0 THEN 100.0
    ELSE ROUND(a.with_formal_approval::numeric / a.total_high_critical * 100, 2)
  END as ai_actions_compliance_pct,
  
  -- Critical Alerts compliance
  c.total_critical as critical_alerts_total,
  c.resolved as critical_alerts_resolved,
  c.resolved_by_human as critical_alerts_human_resolved,
  c.with_decision_event as critical_alerts_with_decision,
  CASE 
    WHEN c.resolved = 0 THEN 100.0
    ELSE ROUND(c.resolved_by_human::numeric / c.resolved * 100, 2)
  END as critical_alerts_compliance_pct,
  
  -- DLQ compliance
  d.total_resolved as dlq_resolved_total,
  d.with_decision_event as dlq_with_decision_event,
  d.with_resolution_source as dlq_with_resolution_source,
  CASE 
    WHEN d.total_resolved = 0 THEN 100.0
    ELSE ROUND(d.with_decision_event::numeric / d.total_resolved * 100, 2)
  END as dlq_compliance_pct,
  
  -- Legacy data (transparency)
  l.legacy_critical_alerts,
  l.legacy_dlq_resolved,
  
  -- Overall enforcement status
  CASE 
    WHEN (a.total_high_critical = 0 OR a.with_formal_approval = a.total_high_critical)
     AND (c.resolved = 0 OR c.resolved_by_human = c.resolved)
     AND (d.total_resolved = 0 OR d.with_decision_event = d.total_resolved)
    THEN 'fully_compliant'
    ELSE 'partial_compliance'
  END as enforcement_status

FROM ai_actions_metrics a
CROSS JOIN critical_alerts_metrics c
CROSS JOIN dlq_metrics d
CROSS JOIN legacy_metrics l;

-- 2. Update get_governance_snapshot() to include enforcement metrics
CREATE OR REPLACE FUNCTION public.get_governance_snapshot(p_tenant_id uuid DEFAULT NULL)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'timestamp', now(),
    'tenant_id', p_tenant_id,
    
    -- AI Governance metrics
    'ai_governance', (
      SELECT jsonb_build_object(
        'total_actions', COUNT(*),
        'pending_review', COUNT(*) FILTER (WHERE human_reviewed = false),
        'approved', COUNT(*) FILTER (WHERE review_decision = 'approved'),
        'rejected', COUNT(*) FILTER (WHERE review_decision = 'rejected'),
        'high_risk_pending', COUNT(*) FILTER (WHERE risk_level IN ('high', 'critical') AND human_reviewed = false)
      )
      FROM ai_actions
      WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ),
    
    -- Human approval metrics
    'human_approval', (
      SELECT jsonb_build_object(
        'total_requests', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'approved', COUNT(*) FILTER (WHERE status = 'approved'),
        'rejected', COUNT(*) FILTER (WHERE status = 'rejected'),
        'expired', COUNT(*) FILTER (WHERE status = 'expired'),
        'avg_resolution_hours', ROUND(EXTRACT(EPOCH FROM AVG(
          CASE WHEN resolved_at IS NOT NULL THEN resolved_at - created_at END
        ))/3600, 2)
      )
      FROM approval_requests
      WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ),
    
    -- DLQ metrics
    'dlq', (
      SELECT jsonb_build_object(
        'total_entries', COUNT(*),
        'pending', COUNT(*) FILTER (WHERE status = 'pending'),
        'resolved', COUNT(*) FILTER (WHERE status = 'resolved'),
        'escalated', COUNT(*) FILTER (WHERE status = 'escalated'),
        'oldest_pending_hours', ROUND(EXTRACT(EPOCH FROM (now() - MIN(
          CASE WHEN status = 'pending' THEN created_at END
        )))/3600, 2)
      )
      FROM failed_jobs_dlq
      WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ),
    
    -- Rollback metrics
    'rollback', (
      SELECT jsonb_build_object(
        'total_events', COUNT(*),
        'safe_mode_triggered', COUNT(*) FILTER (WHERE safe_mode_triggered = true),
        'last_24h', COUNT(*) FILTER (WHERE created_at > now() - interval '24 hours')
      )
      FROM agent_rollback_events
      WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
    ),
    
    -- Decision events metrics
    'decisions', (
      SELECT jsonb_build_object(
        'total_events', COUNT(*),
        'by_type', jsonb_object_agg(COALESCE(decision_type, 'unknown'), cnt)
      )
      FROM (
        SELECT decision_type, COUNT(*) as cnt
        FROM decision_events
        WHERE (p_tenant_id IS NULL OR tenant_id = p_tenant_id)
        GROUP BY decision_type
      ) sub
    ),
    
    -- Tenant isolation metrics
    'tenant_isolation', (
      SELECT jsonb_build_object(
        'total_tables', total_tables,
        'tables_with_rls', tables_with_rls,
        'rls_coverage_pct', rls_coverage_pct,
        'tables_with_isolation', tables_with_isolation,
        'isolation_coverage_pct', isolation_coverage_pct,
        'isolation_status', isolation_status
      )
      FROM v_tenant_isolation_metrics
    ),
    
    -- RBAC metrics
    'rbac', (
      SELECT jsonb_build_object(
        'total_tenants', total_tenants,
        'total_role_assignments', total_role_assignments,
        'users_with_roles', users_with_roles,
        'admin_count', admin_count,
        'super_admin_count', super_admin_count,
        'distinct_roles', distinct_roles,
        'security_functions_present', security_functions_present,
        'rbac_status', rbac_status
      )
      FROM v_rbac_metrics
    ),
    
    -- Enforcement compliance metrics (NEW)
    'enforcement', (
      SELECT jsonb_build_object(
        'active_since', enforcement_active_since,
        'ai_actions', jsonb_build_object(
          'total_high_critical', ai_actions_high_critical,
          'with_approval', ai_actions_with_approval,
          'compliance_pct', ai_actions_compliance_pct
        ),
        'critical_alerts', jsonb_build_object(
          'total', critical_alerts_total,
          'resolved', critical_alerts_resolved,
          'human_resolved', critical_alerts_human_resolved,
          'with_decision', critical_alerts_with_decision,
          'compliance_pct', critical_alerts_compliance_pct
        ),
        'dlq', jsonb_build_object(
          'total_resolved', dlq_resolved_total,
          'with_decision_event', dlq_with_decision_event,
          'compliance_pct', dlq_compliance_pct
        ),
        'legacy_data', jsonb_build_object(
          'critical_alerts_before_enforcement', legacy_critical_alerts,
          'dlq_resolved_before_enforcement', legacy_dlq_resolved
        ),
        'status', enforcement_status
      )
      FROM v_enforcement_compliance
    )
    
  ) INTO result;
  
  RETURN result;
END;
$$;

-- 3. Update governance_health_metrics view to include enforcement columns
DROP VIEW IF EXISTS public.governance_health_metrics;

CREATE OR REPLACE VIEW public.governance_health_metrics AS
SELECT 
  -- AI Governance
  (SELECT COUNT(*) FROM ai_actions WHERE human_reviewed = false) as pending_ai_reviews,
  (SELECT COUNT(*) FROM ai_actions WHERE risk_level IN ('high', 'critical') AND human_reviewed = false) as high_risk_pending,
  
  -- Approval Requests
  (SELECT COUNT(*) FROM approval_requests WHERE status = 'pending') as pending_approvals,
  (SELECT COUNT(*) FROM approval_requests WHERE status = 'pending' AND expires_at < now()) as expired_approvals,
  
  -- DLQ
  (SELECT COUNT(*) FROM failed_jobs_dlq WHERE status = 'pending') as dlq_pending,
  (SELECT COUNT(*) FROM failed_jobs_dlq WHERE status = 'escalated') as dlq_escalated,
  
  -- Alerts
  (SELECT COUNT(*) FROM system_alerts WHERE resolved = false AND severity = 'critical') as critical_alerts_open,
  
  -- RLS & Tenant Isolation
  (SELECT rls_coverage_pct FROM v_tenant_isolation_metrics) as rls_coverage_pct,
  (SELECT isolation_coverage_pct FROM v_tenant_isolation_metrics) as tenant_isolation_pct,
  
  -- RBAC
  (SELECT total_role_assignments FROM v_rbac_metrics) as rbac_assignments,
  (SELECT rbac_status FROM v_rbac_metrics) as rbac_status,
  
  -- Enforcement Compliance (NEW)
  (SELECT enforcement_active_since FROM v_enforcement_compliance) as enforcement_active_since,
  (SELECT ai_actions_compliance_pct FROM v_enforcement_compliance) as ai_actions_compliance_pct,
  (SELECT critical_alerts_compliance_pct FROM v_enforcement_compliance) as critical_alerts_compliance_pct,
  (SELECT dlq_compliance_pct FROM v_enforcement_compliance) as dlq_compliance_pct,
  (SELECT enforcement_status FROM v_enforcement_compliance) as enforcement_status,
  
  -- Legacy data transparency
  (SELECT legacy_critical_alerts FROM v_enforcement_compliance) as legacy_critical_alerts,
  (SELECT legacy_dlq_resolved FROM v_enforcement_compliance) as legacy_dlq_resolved,
  
  -- Overall health score calculation
  CASE 
    WHEN (SELECT COUNT(*) FROM system_alerts WHERE resolved = false AND severity = 'critical') > 0 THEN 'critical'
    WHEN (SELECT COUNT(*) FROM failed_jobs_dlq WHERE status = 'escalated') > 0 THEN 'warning'
    WHEN (SELECT COUNT(*) FROM approval_requests WHERE status = 'pending' AND expires_at < now()) > 0 THEN 'warning'
    WHEN (SELECT enforcement_status FROM v_enforcement_compliance) = 'partial_compliance' THEN 'warning'
    ELSE 'healthy'
  END as health_status,
  
  now() as snapshot_at;

-- 4. Grant permissions
GRANT SELECT ON public.v_enforcement_compliance TO authenticated;
GRANT SELECT ON public.governance_health_metrics TO authenticated;

-- 5. Add comment for documentation
COMMENT ON VIEW public.v_enforcement_compliance IS 
'Provides temporal-aware compliance metrics that separate pre/post-enforcement data.
Enforcement triggers were activated on 2026-01-03 19:31:58.
Legacy data (before enforcement) is tracked separately for transparency.
ADR: ADR-012 - Fechamento dos Ciclos de Governanca Operacional';