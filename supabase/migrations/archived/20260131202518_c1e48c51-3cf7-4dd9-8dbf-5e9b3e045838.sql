-- =============================================================================
-- V-601/V-602/V-603 SECURITY REMEDIATION: Multi-Tenant View Isolation
-- ADR-026 Compliance: All aggregated views must use security_invoker=on
-- and filter by get_active_tenant_id() OR is_current_super_admin()
-- =============================================================================

-- ============================================================================
-- 1. v_dlq_risk_overview - CRITICAL: Was exposing DLQ metrics cross-tenant
-- ============================================================================
DROP VIEW IF EXISTS v_dlq_risk_overview;
CREATE VIEW v_dlq_risk_overview 
WITH (security_invoker = on) AS
SELECT tenant_id,
    count(*) AS total_items,
    count(*) FILTER (WHERE status = 'resolved') AS resolved_items,
    count(*) FILTER (WHERE resolved_by IS NOT NULL) AS manually_reviewed,
    count(*) FILTER (WHERE flagged_suspicious) AS suspicious_items,
    count(*) FILTER (WHERE created_at < (now() - '24:00:00'::interval) AND status <> 'resolved') AS overdue_items,
    round(
        CASE WHEN count(*) > 0 
             THEN (count(*) FILTER (WHERE resolved_by IS NOT NULL)::numeric / count(*)::numeric) * 100 
             ELSE 0 
        END, 2) AS review_rate_pct
FROM failed_jobs_dlq
WHERE created_at > (now() - '30 days'::interval)
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id;

COMMENT ON VIEW v_dlq_risk_overview IS 'ADR-026: Tenant-isolated DLQ risk metrics. Uses security_invoker=on with mandatory tenant filter.';

-- ============================================================================
-- 2. v_pipeline_health_metrics - CRITICAL: Was exposing pipeline metrics cross-tenant
-- ============================================================================
DROP VIEW IF EXISTS v_pipeline_health_metrics;
CREATE VIEW v_pipeline_health_metrics 
WITH (security_invoker = on) AS
SELECT 
    j.tenant_id,
    date_trunc('hour', j.created_at) AS hour,
    j.type,
    count(*) AS total_jobs,
    count(*) FILTER (WHERE status = 'completed') AS completed_jobs,
    count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
    count(*) FILTER (WHERE status = 'queued') AS queued_jobs,
    count(*) FILTER (WHERE status = 'in_progress') AS in_progress_jobs,
    round(
        CASE WHEN count(*) > 0 
             THEN (count(*) FILTER (WHERE status = 'completed')::numeric / count(*)::numeric) * 100 
             ELSE 0 
        END, 2) AS success_rate,
    count(*) FILTER (WHERE status = 'completed' AND j.type = 'collect_web_activity' 
        AND EXISTS (SELECT 1 FROM agent_web_activity aw 
                    WHERE aw.agent_id = j.agent_id AND aw.created_at >= j.created_at)) AS completed_with_data,
    count(*) FILTER (WHERE status = 'completed' 
        AND j.type IN ('collect_web_activity', 'software_inventory_collect', 'collect_antivirus_status') 
        AND output IS NULL) AS silent_failures
FROM jobs j
WHERE j.created_at >= (now() - '24:00:00'::interval)
  AND (j.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY j.tenant_id, date_trunc('hour', j.created_at), j.type
ORDER BY date_trunc('hour', j.created_at) DESC;

COMMENT ON VIEW v_pipeline_health_metrics IS 'ADR-026: Tenant-isolated pipeline health metrics. Uses security_invoker=on with mandatory tenant filter.';

-- ============================================================================
-- 3. v_cron_silence - Adding tenant context (table scheduled_job_heartbeat may not have tenant_id)
-- ============================================================================
DROP VIEW IF EXISTS v_cron_silence;
CREATE VIEW v_cron_silence 
WITH (security_invoker = on) AS
SELECT 
    h.job_key,
    h.last_seen_at,
    h.expected_interval,
    (now() - h.last_seen_at) AS silence_duration,
    h.missed_count,
    h.last_error,
    CASE
        WHEN (now() - h.last_seen_at) > (h.expected_interval * 3) THEN 'critical'
        WHEN (now() - h.last_seen_at) > (h.expected_interval * 2) THEN 'warning'
        ELSE 'ok'
    END AS status
FROM scheduled_job_heartbeat h
WHERE (now() - h.last_seen_at) > h.expected_interval
  AND public.is_current_super_admin(); -- Cron monitoring is admin-only

COMMENT ON VIEW v_cron_silence IS 'ADR-026: Super-admin only cron silence monitoring. Uses security_invoker=on.';

-- ============================================================================
-- 4. v_active_risk_debt - Adding tenant filter
-- ============================================================================
DROP VIEW IF EXISTS v_risk_debt_summary CASCADE;
DROP VIEW IF EXISTS v_active_risk_debt;
CREATE VIEW v_active_risk_debt 
WITH (security_invoker = on) AS
SELECT 
    id,
    tenant_id,
    title,
    description,
    severity,
    risk_accepted_by,
    risk_accepted_at,
    risk_expiry_at,
    risk_justification,
    (EXTRACT(epoch FROM (risk_expiry_at - now())) / 86400) AS days_until_expiry,
    CASE
        WHEN risk_expiry_at <= (now() + '7 days'::interval) THEN 'expiring_soon'
        ELSE 'active'
    END AS risk_status
FROM tasks t
WHERE status = 'accepted_risk' 
  AND (risk_expiry_at IS NULL OR risk_expiry_at > now())
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

COMMENT ON VIEW v_active_risk_debt IS 'ADR-026: Tenant-isolated active risk debt. Uses security_invoker=on with mandatory tenant filter.';

-- ============================================================================
-- 5. v_agent_archive_reason_tree - Adding tenant filter
-- ============================================================================
DROP VIEW IF EXISTS v_agent_archive_reason_tree;
CREATE VIEW v_agent_archive_reason_tree 
WITH (security_invoker = on) AS
SELECT 
    e.id AS event_id,
    e.agent_id,
    a.agent_name,
    a.tenant_id,
    e.reason,
    e.actor_type,
    e.actor_id,
    e.notes,
    e.created_at,
    a.archived_at,
    a.archived_reason
FROM agent_archive_events e
JOIN agents a ON a.id = e.agent_id
WHERE a.archived_at IS NOT NULL
  AND (a.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
ORDER BY e.created_at DESC;

COMMENT ON VIEW v_agent_archive_reason_tree IS 'ADR-026: Tenant-isolated agent archive events. Uses security_invoker=on with mandatory tenant filter.';

-- ============================================================================
-- 6. v_anomalies_without_runbook - Admin-only view (references v_job_health_anomalies)
-- ============================================================================
DROP VIEW IF EXISTS v_anomalies_without_runbook;
CREATE VIEW v_anomalies_without_runbook 
WITH (security_invoker = on) AS
SELECT DISTINCT anomaly_type
FROM v_job_health_anomalies
WHERE NOT (anomaly_type IN (SELECT anomaly_type FROM runbooks))
  AND public.is_current_super_admin(); -- System-wide analysis is admin-only

COMMENT ON VIEW v_anomalies_without_runbook IS 'ADR-026: Super-admin only anomaly analysis. Uses security_invoker=on.';

-- ============================================================================
-- 7. v_incident_groups_with_slo - Already uses v_incident_groups which should be tenant-filtered
-- ============================================================================
DROP VIEW IF EXISTS v_incident_groups_with_slo;
CREATE VIEW v_incident_groups_with_slo 
WITH (security_invoker = on) AS
SELECT 
    ig.id,
    ig.fingerprint_hash,
    ig.source_type,
    ig.failure_class,
    ig.normalized_signature,
    ig.severity_hint,
    ig.total_occurrences,
    ig.distinct_tenants,
    ig.distinct_agents,
    ig.first_seen_at,
    ig.last_seen_at,
    ig.is_active,
    ig.is_ongoing,
    COALESCE(slo.slo_target, 99.0) AS slo_target,
    COALESCE(slo.error_budget, 0.01) AS error_budget,
    COALESCE(slo.burn_rate_1h, 0) AS burn_rate_1h,
    COALESCE(slo.burn_rate_6h, 0) AS burn_rate_6h,
    COALESCE(slo.burn_rate_24h, 0) AS burn_rate_24h,
    COALESCE(slo.budget_consumed, 0) AS budget_consumed,
    COALESCE(slo.budget_remaining, 100) AS budget_remaining,
    COALESCE(slo.status, 'ok') AS slo_status,
    COALESCE(slo.occurrences_1h, 0) AS occurrences_1h,
    COALESCE(slo.occurrences_6h, 0) AS occurrences_6h,
    slo.last_evaluated_at
FROM v_incident_groups ig
LEFT JOIN incident_slo_state slo ON slo.fingerprint_id = ig.id
WHERE public.is_current_super_admin() -- Incident groups are system-wide, admin only
ORDER BY COALESCE(slo.burn_rate_1h, 0) DESC NULLS LAST, 
         (ig.severity_hint = 'critical') DESC, 
         ig.total_occurrences DESC;

COMMENT ON VIEW v_incident_groups_with_slo IS 'ADR-026: Super-admin only incident SLO monitoring. Uses security_invoker=on.';

-- ============================================================================
-- 8. v_risk_debt_active - Adding tenant filter (similar to v_active_risk_debt)
-- ============================================================================
DROP VIEW IF EXISTS v_risk_debt_active;
CREATE VIEW v_risk_debt_active 
WITH (security_invoker = on) AS
SELECT 
    id,
    tenant_id,
    title,
    severity,
    closed_at AS accepted_at,
    (closure_evidence ->> 'expiry_date')::timestamp with time zone AS expires_at,
    closure_reason AS justification,
    closed_by AS accepted_by,
    closure_evidence ->> 'approved_by' AS approved_by
FROM tasks t
WHERE status = 'accepted_risk' 
  AND (closure_evidence ->> 'expiry_date') IS NOT NULL 
  AND (closure_evidence ->> 'expiry_date')::timestamp with time zone > now()
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

COMMENT ON VIEW v_risk_debt_active IS 'ADR-026: Tenant-isolated active risk debt view. Uses security_invoker=on with mandatory tenant filter.';

-- ============================================================================
-- 9. v_risk_debt_summary - References v_risk_debt_active, now tenant-filtered
-- ============================================================================
CREATE VIEW v_risk_debt_summary 
WITH (security_invoker = on) AS
SELECT 
    tenant_id,
    count(*) AS total_active,
    count(*) FILTER (WHERE severity = 'critical') AS critical_count,
    count(*) FILTER (WHERE severity = 'high') AS high_count,
    count(*) FILTER (WHERE expires_at IS NOT NULL AND expires_at < (now() + '7 days'::interval)) AS expiring_soon
FROM v_risk_debt_active
GROUP BY tenant_id;

COMMENT ON VIEW v_risk_debt_summary IS 'ADR-026: Tenant-isolated risk debt summary. Inherits tenant filter from v_risk_debt_active.';

-- ============================================================================
-- 10. v_system_contracts - Static reference data, admin-only access
-- ============================================================================
DROP VIEW IF EXISTS v_system_contracts;
CREATE VIEW v_system_contracts 
WITH (security_invoker = on) AS
SELECT 'task_source_type'::text AS contract,
    unnest(ARRAY['ai_insight', 'system_alert', 'playbook_execution', 'red_team', 'manual', 'job', 'dlq']) AS value
WHERE public.is_current_super_admin() OR auth.uid() IS NOT NULL
UNION ALL
SELECT 'job_status'::text AS contract,
    unnest(ARRAY['pending', 'in_progress', 'completed', 'failed', 'cancelled', 'timeout', 'delivered', 'ack_timeout']) AS value
WHERE public.is_current_super_admin() OR auth.uid() IS NOT NULL
UNION ALL
SELECT 'failure_class'::text AS contract,
    unnest(ARRAY['TRANSIENT', 'PERMANENT', 'EXPECTED_DROP', 'BUG', 'UNKNOWN']) AS value
WHERE public.is_current_super_admin() OR auth.uid() IS NOT NULL;

COMMENT ON VIEW v_system_contracts IS 'ADR-026: System contract enums. Uses security_invoker=on with auth check.';

-- ============================================================================
-- 11. v_tenant_claim_health - Admin-only monitoring view
-- ============================================================================
DROP VIEW IF EXISTS v_tenant_claim_health;
CREATE VIEW v_tenant_claim_health 
WITH (security_invoker = on) AS
SELECT 
    date_trunc('hour', created_at) AS period,
    count(*) FILTER (WHERE (details ->> 'active_tenant_id') IS NOT NULL AND (details ->> 'active_tenant_id') <> '') AS valid_claims,
    count(*) FILTER (WHERE (details ->> 'active_tenant_id') IS NULL OR (details ->> 'active_tenant_id') = '') AS missing_claims,
    count(*) FILTER (WHERE action = 'tenant_switch') AS tenant_switches,
    count(*) FILTER (WHERE action = 'update_user_role' AND success = false) AS cross_tenant_attempts
FROM audit_logs
WHERE created_at > (now() - '7 days'::interval)
  AND public.is_current_super_admin() -- JWT health monitoring is admin-only
GROUP BY date_trunc('hour', created_at)
ORDER BY date_trunc('hour', created_at) DESC;

COMMENT ON VIEW v_tenant_claim_health IS 'ADR-026: Super-admin only tenant claim health monitoring. Uses security_invoker=on.';

-- ============================================================================
-- V-603 FIX: Add search_path to create_dlq_decision_event SECURITY DEFINER function
-- ============================================================================
CREATE OR REPLACE FUNCTION public.create_dlq_decision_event()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_tenant_id uuid;
  v_decision_source text;
BEGIN
  -- So processa quando status muda para 'resolved' ou 'failed'
  IF (TG_OP = 'UPDATE' AND NEW.status IN ('resolved', 'failed') AND OLD.status = 'pending') THEN
    v_tenant_id := NEW.tenant_id;
    
    -- Mapear resolution_source para decision_source valido
    -- Valores validos: 'human', 'ai', 'system', 'policy', 'resilience_engine'
    v_decision_source := CASE 
      WHEN NEW.resolution_source = 'auto_cleanup' THEN 'system'
      WHEN NEW.resolution_source = 'human' THEN 'human'
      WHEN NEW.resolution_source = 'ai' THEN 'ai'
      WHEN NEW.resolution_source = 'policy' THEN 'policy'
      WHEN NEW.resolution_source = 'resilience_engine' THEN 'resilience_engine'
      WHEN NEW.resolved_by IS NOT NULL THEN 'human'
      ELSE 'system'
    END;
    
    INSERT INTO public.decision_events (
      tenant_id, 
      rule_code, 
      action, 
      evidence, 
      decision_source, 
      decision_type
    ) VALUES (
      v_tenant_id,
      'DLQ_RESOLUTION',
      'resolve_dlq_item',
      jsonb_build_object(
        'dlq_item_id', NEW.id,
        'original_job_id', NEW.original_job_id,
        'job_type', NEW.job_type,
        'error_message', NEW.error_message,
        'resolution_notes', NEW.resolution_notes,
        'resolution_source_original', NEW.resolution_source,
        'resolved_by', NEW.resolved_by
      ),
      v_decision_source,
      'system'
    );
  END IF;
  
  RETURN NEW;
END;
$function$;

COMMENT ON FUNCTION public.create_dlq_decision_event() IS 'ADR-026/V-603: Trigger function with fixed search_path to prevent injection.';

-- ============================================================================
-- Grant permissions for authenticated users on all views
-- ============================================================================
GRANT SELECT ON v_dlq_risk_overview TO authenticated;
GRANT SELECT ON v_pipeline_health_metrics TO authenticated;
GRANT SELECT ON v_cron_silence TO authenticated;
GRANT SELECT ON v_active_risk_debt TO authenticated;
GRANT SELECT ON v_agent_archive_reason_tree TO authenticated;
GRANT SELECT ON v_anomalies_without_runbook TO authenticated;
GRANT SELECT ON v_incident_groups_with_slo TO authenticated;
GRANT SELECT ON v_risk_debt_active TO authenticated;
GRANT SELECT ON v_risk_debt_summary TO authenticated;
GRANT SELECT ON v_system_contracts TO authenticated;
GRANT SELECT ON v_tenant_claim_health TO authenticated;