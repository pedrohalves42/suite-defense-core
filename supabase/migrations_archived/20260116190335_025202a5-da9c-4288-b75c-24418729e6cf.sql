-- ADR-026 Phase A: Batch 2 - Create 12 views with tenant isolation

-- 1. job_integrity_violations
CREATE VIEW public.job_integrity_violations WITH (security_invoker = on) AS
SELECT j.id, j.tenant_id, j.agent_id, j.agent_name, j.type, j.status, j.created_at,
    j.payload_hash,
    CASE WHEN j.payload_hash IS NULL THEN 'missing_payload_hash'
         ELSE 'unknown' END AS violation_type
FROM jobs j
WHERE j.payload_hash IS NULL
  AND (j.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 2. jobs_normalized
CREATE VIEW public.jobs_normalized WITH (security_invoker = on) AS
SELECT id, tenant_id, agent_id, agent_name, type, status, priority, created_at, 
    delivered_at, completed_at, error_message, payload_hash,
    EXTRACT(epoch FROM (delivered_at - created_at)) AS queue_time_seconds,
    EXTRACT(epoch FROM (completed_at - delivered_at)) AS execution_time_seconds
FROM jobs
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

-- 3. v_action_center
CREATE VIEW public.v_action_center WITH (security_invoker = on) AS
SELECT 'dlq' AS source, d.id, d.tenant_id, d.job_type AS item_type, d.error_message AS description,
    d.status AS item_status, d.created_at, 'high'::text AS priority
FROM failed_jobs_dlq d WHERE d.status = 'pending'
  AND (d.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
UNION ALL
SELECT 'alert' AS source, a.id, a.tenant_id, a.alert_type AS item_type, a.message AS description,
    CASE WHEN a.resolved THEN 'resolved' ELSE 'open' END AS item_status, a.created_at, a.severity::text AS priority
FROM system_alerts a WHERE a.resolved = false
  AND (a.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
ORDER BY created_at DESC LIMIT 100;

-- 4. v_agent_health_by_node
CREATE VIEW public.v_agent_health_by_node WITH (security_invoker = on) AS
SELECT tenant_id, hostname,
    count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat > now() - '15 minutes'::interval) AS healthy,
    count(*) FILTER (WHERE last_heartbeat < now() - '15 minutes'::interval) AS unhealthy,
    count(*) FILTER (WHERE is_isolated = true) AS isolated
FROM agents WHERE archived_at IS NULL
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id, hostname;

-- 5. v_agent_health_summary
CREATE VIEW public.v_agent_health_summary WITH (security_invoker = on) AS
SELECT tenant_id,
    count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat > now() - '15 minutes'::interval) AS online,
    count(*) FILTER (WHERE last_heartbeat < now() - '15 minutes'::interval AND last_heartbeat > now() - '1 hour'::interval) AS degraded,
    count(*) FILTER (WHERE last_heartbeat < now() - '1 hour'::interval OR last_heartbeat IS NULL) AS offline,
    count(*) FILTER (WHERE is_isolated = true) AS isolated,
    count(*) FILTER (WHERE agent_state = 'safe_mode') AS safe_mode
FROM agents WHERE archived_at IS NULL
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id;

-- 6. v_agent_lifecycle_state
CREATE VIEW public.v_agent_lifecycle_state WITH (security_invoker = on) AS
SELECT id, tenant_id, agent_name, display_name, status, agent_state, enrolled_at, last_heartbeat,
    archived_at, archived_reason,
    CASE WHEN archived_at IS NOT NULL THEN 'archived'
         WHEN agent_state = 'safe_mode' THEN 'safe_mode'
         WHEN is_isolated THEN 'isolated'
         WHEN last_heartbeat < now() - '1 hour'::interval THEN 'offline'
         WHEN last_heartbeat < now() - '15 minutes'::interval THEN 'degraded'
         WHEN status = 'active' THEN 'healthy'
         ELSE 'unknown' END AS lifecycle_state
FROM agents
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

-- 7. v_ai_anomalies (FIXED: uses actual columns from ai_anomalies table)
CREATE VIEW public.v_ai_anomalies WITH (security_invoker = on) AS
SELECT id, tenant_id, function_name, anomaly_type, severity, context, detected_at, 
    reviewed_by, reviewed_at, resolution, created_at
FROM ai_anomalies
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

-- 8. v_audit_integrity_status
CREATE VIEW public.v_audit_integrity_status WITH (security_invoker = on) AS
SELECT tenant_id,
    count(*) AS total_records,
    count(*) FILTER (WHERE integrity_hash IS NOT NULL) AS with_hash,
    count(*) FILTER (WHERE integrity_hash IS NULL) AS without_hash,
    max(created_at) AS last_audit_at
FROM audit_logs
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id;

-- 9. v_audit_moving_average
CREATE VIEW public.v_audit_moving_average WITH (security_invoker = on) AS
SELECT tenant_id, date_trunc('hour', created_at) AS hour,
    count(*) AS event_count,
    count(DISTINCT user_id) AS unique_users,
    count(DISTINCT action) AS unique_actions
FROM audit_logs WHERE created_at > now() - '24 hours'::interval
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id, date_trunc('hour', created_at)
ORDER BY date_trunc('hour', created_at) DESC;

-- 10. v_cron_silent_failures
CREATE VIEW public.v_cron_silent_failures WITH (security_invoker = on) AS
SELECT id, tenant_id, name AS job_name, cron_expr AS cron_expression, last_run_at, next_run_at,
    CASE WHEN enabled = false THEN 'disabled'
         WHEN last_run_at < now() - '2 hours'::interval THEN 'failed'
         ELSE 'active' END AS status,
    enabled
FROM scheduled_jobs WHERE (enabled = false OR (enabled = true AND last_run_at < now() - '2 hours'::interval))
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 11. v_dlq_pending_attention
CREATE VIEW public.v_dlq_pending_attention WITH (security_invoker = on) AS
SELECT id, tenant_id, job_type, error_message, status, created_at, retry_count, original_job_id
FROM failed_jobs_dlq WHERE status = 'pending'
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
ORDER BY created_at DESC LIMIT 50;

-- 12. v_edge_function_stats
CREATE VIEW public.v_edge_function_stats WITH (security_invoker = on) AS
SELECT tenant_id, function_name,
    count(*) AS total_calls,
    count(*) FILTER (WHERE success = true) AS successful,
    count(*) FILTER (WHERE success = false) AS failed,
    round(avg(latency_ms), 2) AS avg_execution_ms
FROM edge_function_metrics
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id, function_name;