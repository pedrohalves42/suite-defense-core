
-- =============================================================================
-- SSA-SEC-010: Defense-in-Depth View Hardening (Phase 2)
-- =============================================================================
-- Adds security_invoker=on, security_barrier=true, and auth.uid() IS NOT NULL
-- to 15 critical views that handle tenant-sensitive data.
-- REF: Zero-Gap Audit Phase 2, ADR-026
-- =============================================================================

-- 1. agent_snapshots
DROP VIEW IF EXISTS public.agent_snapshots;
CREATE VIEW public.agent_snapshots WITH (security_invoker = on, security_barrier = true) AS
SELECT id AS agent_id,
    tenant_id,
    agent_name,
    display_name,
    hostname,
    status,
    agent_version,
    last_heartbeat,
    agent_mode,
    enrolled_at AS created_at
FROM agents a
WHERE archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.agent_snapshots FROM anon;
GRANT SELECT ON public.agent_snapshots TO authenticated;

-- 2. v_agent_state
DROP VIEW IF EXISTS public.v_agent_state;
CREATE VIEW public.v_agent_state WITH (security_invoker = on, security_barrier = true) AS
SELECT id AS agent_id,
    id,
    tenant_id,
    hostname,
    agent_name,
    display_name,
    last_heartbeat,
    agent_version,
    agent_state,
    agent_state_reason,
    is_isolated,
    is_throttled,
    safe_mode_reason,
    safe_mode_entered_at,
    CASE
        WHEN archived_at IS NOT NULL THEN 'archived'
        WHEN is_isolated THEN 'isolated'
        WHEN agent_state = 'safe_mode' THEN 'safe_mode'
        WHEN last_heartbeat IS NULL THEN 'never_connected'
        WHEN last_heartbeat < (now() - '00:10:00'::interval) THEN 'offline'
        WHEN last_heartbeat < (now() - '00:05:00'::interval) THEN 'warning'
        WHEN last_heartbeat < (now() - '00:02:00'::interval) THEN 'warning'
        ELSE 'healthy'
    END AS canonical_state,
    EXTRACT(epoch FROM (now() - last_heartbeat)) AS heartbeat_lag_seconds,
    round((EXTRACT(epoch FROM (now() - last_heartbeat)) / 60.0), 1) AS heartbeat_lag_minutes,
    now() AS snapshot_at
FROM agents a
WHERE status = 'active'
  AND archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.v_agent_state FROM anon;
GRANT SELECT ON public.v_agent_state TO authenticated;

-- 3. v_agent_lifecycle_state
DROP VIEW IF EXISTS public.v_agent_lifecycle_state;
CREATE VIEW public.v_agent_lifecycle_state WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
    id AS agent_id,
    tenant_id,
    agent_name,
    display_name,
    status,
    agent_state,
    enrolled_at,
    last_heartbeat,
    archived_at,
    archived_reason,
    enrolled_at AS command_copied_at,
    last_heartbeat AS agent_installed_at,
    CASE
        WHEN enrolled_at IS NOT NULL AND last_heartbeat IS NOT NULL THEN (EXTRACT(epoch FROM (last_heartbeat - enrolled_at)) / 60.0)
        ELSE NULL::numeric
    END AS minutes_between_copy_and_install,
    CASE
        WHEN archived_at IS NOT NULL THEN 'archived'
        WHEN agent_state = 'safe_mode' THEN 'safe_mode'
        WHEN is_isolated THEN 'isolated'
        WHEN last_heartbeat < (now() - '01:00:00'::interval) THEN 'offline'
        WHEN last_heartbeat IS NOT NULL THEN 'active'
        WHEN enrolled_at IS NOT NULL AND last_heartbeat IS NULL THEN 'pending_install'
        ELSE 'enrolled_only'
    END AS lifecycle_status,
    CASE
        WHEN enrolled_at IS NOT NULL AND last_heartbeat IS NULL AND enrolled_at < (now() - '00:30:00'::interval) THEN true
        ELSE false
    END AS is_stuck
FROM agents a
WHERE archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.v_agent_lifecycle_state FROM anon;
GRANT SELECT ON public.v_agent_lifecycle_state TO authenticated;

-- 4. v_agent_execution_health
DROP VIEW IF EXISTS public.v_agent_execution_health;
CREATE VIEW public.v_agent_execution_health WITH (security_invoker = on, security_barrier = true) AS
SELECT a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    a.status,
    a.last_heartbeat,
    a.agent_mode,
    a.agent_version,
    a.enrolled_at,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'never_seen'
        WHEN a.last_heartbeat < (now() - '00:15:00'::interval) THEN 'offline'
        WHEN a.last_heartbeat < (now() - '00:05:00'::interval) THEN 'degraded'
        WHEN a.agent_mode = 'safe_mode' THEN 'safe_mode'
        WHEN le.last_execution_at IS NULL THEN 'not_executing_jobs'
        WHEN le.last_execution_at < (now() - '02:00:00'::interval) THEN 'execution_stale'
        WHEN COALESCE(jq.stale_queued, 0::bigint) >= 3 THEN 'not_polling_jobs'
        ELSE 'healthy'
    END AS health_status,
    (EXTRACT(epoch FROM (now() - a.last_heartbeat)))::integer AS seconds_since_heartbeat,
    ((EXTRACT(epoch FROM (now() - a.last_heartbeat)) / 60::numeric))::integer AS minutes_since_heartbeat,
    ((EXTRACT(epoch FROM (now() - le.last_execution_at)) / 60::numeric))::integer AS minutes_since_execution,
    le.last_execution_at,
    COALESCE(jq.stale_queued, 0::bigint)::integer AS stale_queued_jobs,
    COALESCE(jq.stale_delivered, 0::bigint)::integer AS stale_delivered_jobs,
    COALESCE(jq.pending, 0::bigint)::integer AS pending_jobs
FROM agents a
LEFT JOIN LATERAL (
    SELECT max(je.finished_at) AS last_execution_at
    FROM job_executions je
    WHERE je.agent_id = a.id
) le ON true
LEFT JOIN LATERAL (
    SELECT count(*) FILTER (WHERE j.status = 'queued' AND j.created_at < (now() - '01:00:00'::interval)) AS stale_queued,
           count(*) FILTER (WHERE j.status = 'delivered' AND j.created_at < (now() - '01:00:00'::interval)) AS stale_delivered,
           count(*) FILTER (WHERE j.status IN ('queued', 'delivered')) AS pending
    FROM jobs j
    WHERE j.agent_id = a.id
) jq ON true
WHERE a.archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.v_agent_execution_health FROM anon;
GRANT SELECT ON public.v_agent_execution_health TO authenticated;

-- 5. v_agent_health_summary
DROP VIEW IF EXISTS public.v_agent_health_summary;
CREATE VIEW public.v_agent_health_summary WITH (security_invoker = on, security_barrier = true) AS
SELECT tenant_id,
    count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat > (now() - '00:15:00'::interval)) AS online,
    count(*) FILTER (WHERE last_heartbeat < (now() - '00:15:00'::interval) AND last_heartbeat > (now() - '01:00:00'::interval)) AS degraded,
    count(*) FILTER (WHERE last_heartbeat < (now() - '01:00:00'::interval) OR last_heartbeat IS NULL) AS offline,
    count(*) FILTER (WHERE is_isolated = true) AS isolated,
    count(*) FILTER (WHERE agent_state = 'safe_mode') AS safe_mode
FROM agents
WHERE archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id;

REVOKE ALL ON public.v_agent_health_summary FROM anon;
GRANT SELECT ON public.v_agent_health_summary TO authenticated;

-- 6. v_agent_health_by_node
DROP VIEW IF EXISTS public.v_agent_health_by_node;
CREATE VIEW public.v_agent_health_by_node WITH (security_invoker = on, security_barrier = true) AS
SELECT tenant_id,
    hostname,
    count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat > (now() - '00:15:00'::interval)) AS healthy,
    count(*) FILTER (WHERE last_heartbeat < (now() - '00:15:00'::interval)) AS unhealthy,
    count(*) FILTER (WHERE is_isolated = true) AS isolated
FROM agents
WHERE archived_at IS NULL
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id, hostname;

REVOKE ALL ON public.v_agent_health_by_node FROM anon;
GRANT SELECT ON public.v_agent_health_by_node TO authenticated;

-- 7. v_problematic_agents
DROP VIEW IF EXISTS public.v_problematic_agents;
CREATE VIEW public.v_problematic_agents WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
    tenant_id,
    agent_name,
    display_name,
    hostname,
    status,
    agent_state,
    last_heartbeat,
    agent_version,
    is_isolated,
    isolation_reason,
    CASE
        WHEN is_isolated THEN 'isolated'
        WHEN agent_state = 'safe_mode' THEN 'safe_mode'
        WHEN last_heartbeat < (now() - '01:00:00'::interval) THEN 'offline'
        WHEN last_heartbeat < (now() - '00:15:00'::interval) THEN 'degraded'
        ELSE 'unknown'
    END AS problem_type,
    GREATEST(last_heartbeat, isolated_at, agent_state_changed_at) AS problem_since
FROM agents
WHERE archived_at IS NULL
  AND (is_isolated OR agent_state = 'safe_mode' OR last_heartbeat < (now() - '00:15:00'::interval))
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.v_problematic_agents FROM anon;
GRANT SELECT ON public.v_problematic_agents TO authenticated;

-- 8. v_problematic_jobs
DROP VIEW IF EXISTS public.v_problematic_jobs;
CREATE VIEW public.v_problematic_jobs WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
    tenant_id,
    agent_id,
    agent_name,
    type,
    status,
    created_at,
    delivered_at,
    error_message,
    CASE
        WHEN status = 'queued' AND created_at < (now() - '01:00:00'::interval) THEN 'stuck_queued'
        WHEN status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval) THEN 'stuck_delivered'
        WHEN status = 'failed' AND error_message IS NOT NULL THEN 'failed_with_error'
        WHEN status = 'failed' THEN 'failed_silent'
        ELSE 'unknown'
    END AS problem_type,
    (EXTRACT(epoch FROM (now() - COALESCE(delivered_at, created_at))) / 60::numeric) AS minutes_stuck
FROM jobs
WHERE ((status = 'queued' AND created_at < (now() - '01:00:00'::interval))
    OR (status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval))
    OR status = 'failed')
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.v_problematic_jobs FROM anon;
GRANT SELECT ON public.v_problematic_jobs TO authenticated;

-- 9. v_stuck_jobs_report
DROP VIEW IF EXISTS public.v_stuck_jobs_report;
CREATE VIEW public.v_stuck_jobs_report WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
    agent_name,
    type,
    status,
    tenant_id,
    created_at,
    delivered_at,
    (EXTRACT(epoch FROM (now() - COALESCE(delivered_at, created_at))) / 60::numeric) AS minutes_stuck,
    CASE
        WHEN status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval) THEN 'stuck_delivered'
        WHEN status = 'queued' AND created_at < (now() - '02:00:00'::interval) THEN 'stuck_queued'
        WHEN status = 'pending' AND created_at < (now() - '01:00:00'::interval) THEN 'stuck_pending'
        ELSE 'normal'
    END AS stuck_reason
FROM jobs
WHERE ((status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval))
    OR (status = 'queued' AND created_at < (now() - '02:00:00'::interval))
    OR (status = 'pending' AND created_at < (now() - '01:00:00'::interval)))
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
ORDER BY (EXTRACT(epoch FROM (now() - COALESCE(delivered_at, created_at))) / 60::numeric) DESC;

REVOKE ALL ON public.v_stuck_jobs_report FROM anon;
GRANT SELECT ON public.v_stuck_jobs_report TO authenticated;

-- 10. v_action_center
DROP VIEW IF EXISTS public.v_action_center;
CREATE VIEW public.v_action_center WITH (security_invoker = on, security_barrier = true) AS
SELECT 'dlq'::text AS source,
    d.id,
    d.tenant_id,
    d.job_type AS item_type,
    d.error_message AS description,
    d.status AS item_status,
    d.created_at,
    'high'::text AS priority
FROM failed_jobs_dlq d
WHERE d.status = 'pending'
  AND auth.uid() IS NOT NULL
  AND (d.tenant_id = get_active_tenant_id() OR is_current_super_admin())
UNION ALL
SELECT 'alert'::text AS source,
    a.id,
    a.tenant_id,
    a.alert_type AS item_type,
    a.message AS description,
    CASE WHEN a.resolved THEN 'resolved' ELSE 'open' END AS item_status,
    a.created_at,
    a.severity AS priority
FROM system_alerts a
WHERE a.resolved = false
  AND auth.uid() IS NOT NULL
  AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
ORDER BY 7 DESC
LIMIT 100;

REVOKE ALL ON public.v_action_center FROM anon;
GRANT SELECT ON public.v_action_center TO authenticated;

-- 11. v_governance_stats
DROP VIEW IF EXISTS public.v_governance_stats;
CREATE VIEW public.v_governance_stats WITH (security_invoker = on, security_barrier = true) AS
SELECT tenant_id,
    count(*) AS total_reports,
    count(*) FILTER (WHERE approved_at IS NOT NULL) AS approved,
    count(*) FILTER (WHERE approved_at IS NULL) AS pending,
    max(generated_at) AS last_report_at
FROM governance_reports
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id;

REVOKE ALL ON public.v_governance_stats FROM anon;
GRANT SELECT ON public.v_governance_stats TO authenticated;

-- 12. v_soc2_readiness
DROP VIEW IF EXISTS public.v_soc2_readiness;
CREATE VIEW public.v_soc2_readiness WITH (security_invoker = on, security_barrier = true) AS
SELECT tenant_id,
    control_code,
    control_name,
    description,
    status,
    evidence_type,
    evidence_ref,
    gap_notes,
    remediation_plan,
    owner,
    due_date,
    verified_at,
    verified_by
FROM soc2_controls
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.v_soc2_readiness FROM anon;
GRANT SELECT ON public.v_soc2_readiness TO authenticated;

-- 13. dlq_categorized
DROP VIEW IF EXISTS public.dlq_categorized;
CREATE VIEW public.dlq_categorized WITH (security_invoker = on, security_barrier = true) AS
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
            WHEN failure_class IN ('security', 'critical', 'auth_failure') THEN 'security'
            WHEN retry_count > 5 THEN 'reliability'
            ELSE 'operational'
        END) AS risk_category
FROM failed_jobs_dlq
WHERE auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.dlq_categorized FROM anon;
GRANT SELECT ON public.dlq_categorized TO authenticated;

-- 14. v_dlq_pending_attention
DROP VIEW IF EXISTS public.v_dlq_pending_attention;
CREATE VIEW public.v_dlq_pending_attention WITH (security_invoker = on, security_barrier = true) AS
SELECT id,
    tenant_id,
    job_type,
    error_message,
    status,
    created_at,
    retry_count,
    original_job_id
FROM failed_jobs_dlq
WHERE status = 'pending'
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
ORDER BY created_at DESC
LIMIT 50;

REVOKE ALL ON public.v_dlq_pending_attention FROM anon;
GRANT SELECT ON public.v_dlq_pending_attention TO authenticated;

-- 15. v_pipeline_health_metrics
DROP VIEW IF EXISTS public.v_pipeline_health_metrics;
CREATE VIEW public.v_pipeline_health_metrics WITH (security_invoker = on, security_barrier = true) AS
SELECT tenant_id,
    date_trunc('hour', created_at) AS hour,
    type,
    count(*) AS total_jobs,
    count(*) FILTER (WHERE status = 'completed') AS completed_jobs,
    count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
    count(*) FILTER (WHERE status = 'queued') AS queued_jobs,
    count(*) FILTER (WHERE status = 'in_progress') AS in_progress_jobs,
    round(
        CASE
            WHEN count(*) > 0 THEN ((count(*) FILTER (WHERE status = 'completed'))::numeric / count(*)::numeric) * 100::numeric
            ELSE 0::numeric
        END, 2) AS success_rate,
    count(*) FILTER (WHERE status = 'completed' AND type = 'collect_web_activity' AND EXISTS (
        SELECT 1 FROM agent_web_activity aw WHERE aw.agent_id = j.agent_id AND aw.created_at >= j.created_at
    )) AS completed_with_data,
    count(*) FILTER (WHERE status = 'completed' AND type IN ('collect_web_activity', 'software_inventory_collect', 'collect_antivirus_status') AND output IS NULL) AS silent_failures
FROM jobs j
WHERE created_at >= (now() - '24:00:00'::interval)
  AND auth.uid() IS NOT NULL
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin())
GROUP BY tenant_id, date_trunc('hour', created_at), type
ORDER BY date_trunc('hour', created_at) DESC;

REVOKE ALL ON public.v_pipeline_health_metrics FROM anon;
GRANT SELECT ON public.v_pipeline_health_metrics TO authenticated;

-- =============================================================================
-- Documentation: SSA-SEC-010 Hardening Summary
-- =============================================================================
COMMENT ON VIEW public.agent_snapshots IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_agent_state IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_agent_lifecycle_state IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_agent_execution_health IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_agent_health_summary IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_agent_health_by_node IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_problematic_agents IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_problematic_jobs IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_stuck_jobs_report IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_action_center IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_governance_stats IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_soc2_readiness IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.dlq_categorized IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_dlq_pending_attention IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
COMMENT ON VIEW public.v_pipeline_health_metrics IS 'SSA-SEC-010: Hardened with security_invoker, security_barrier, auth.uid() filter';
