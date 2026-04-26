
-- ============================================
-- FIX: Cross-tenant data leaks in views
-- V-1500: Views sem isolamento de tenant
-- ============================================

-- 1. hmac_agent_secrets: CRITICAL - expoe hmac_secret de TODOS os tenants sem auth check
-- Esta view e usada apenas por Edge Functions (service_role), mas deve ter guard
DROP VIEW IF EXISTS public.hmac_agent_secrets;
CREATE VIEW public.hmac_agent_secrets
WITH (security_invoker=on, security_barrier=true) AS
SELECT id AS agent_id, hmac_secret, tenant_id
FROM agents a
WHERE status = 'active' AND hmac_secret IS NOT NULL
  AND (
    tenant_id = get_active_tenant_id()
    OR current_setting('role', true) = 'service_role'
  );

-- 2. v_normalized_events: CRITICAL - expoe eventos EDR de TODOS os tenants sem filtro
DROP VIEW IF EXISTS public.v_normalized_events;
CREATE VIEW public.v_normalized_events
WITH (security_invoker=on, security_barrier=true) AS
SELECT id, tenant_id, agent_id, event_time, 'process'::text AS event_category,
    event_type, process_name, command_line, sha256_hash AS file_hash,
    NULL::text AS file_path, NULL::text AS remote_address, NULL::integer AS remote_port,
    NULL::text AS domain, NULL::text AS key_path, user_name,
    pid AS process_pid, parent_pid AS parent_process_pid, parent_process_name,
    mitre_technique_id, mitre_tactic, is_suspicious, detection_tags,
    NULL::text AS severity, NULL::text AS detection_name, created_at
FROM endpoint_process_events WHERE tenant_id = get_active_tenant_id()
UNION ALL
SELECT id, tenant_id, agent_id, event_time, 'file'::text, event_type, process_name,
    NULL, sha256_hash, file_path, NULL, NULL, NULL, NULL, NULL,
    process_pid, NULL, NULL, NULL, NULL, is_suspicious, detection_tags,
    NULL, NULL, created_at
FROM endpoint_file_events WHERE tenant_id = get_active_tenant_id()
UNION ALL
SELECT id, tenant_id, agent_id, event_time, 'network'::text, event_type, process_name,
    NULL, NULL, NULL, remote_address, remote_port, domain, NULL, NULL,
    process_pid, NULL, NULL, NULL, NULL, is_suspicious, detection_tags,
    NULL, NULL, created_at
FROM endpoint_network_events WHERE tenant_id = get_active_tenant_id()
UNION ALL
SELECT id, tenant_id, agent_id, event_time, 'registry'::text, event_type, process_name,
    NULL, NULL, NULL, NULL, NULL, NULL, key_path, NULL,
    process_pid, NULL, NULL, mitre_technique_id, NULL, is_suspicious, detection_tags,
    NULL, NULL, created_at
FROM endpoint_registry_events WHERE tenant_id = get_active_tenant_id()
UNION ALL
SELECT id, tenant_id, agent_id, event_time, 'detection'::text, source_event_type, process_name,
    command_line, NULL, file_path, remote_address, NULL, NULL, NULL, NULL,
    process_pid, NULL, NULL, mitre_technique_id, mitre_tactic, true, ARRAY[]::text[],
    severity, detection_name, created_at
FROM endpoint_detection_events WHERE tenant_id = get_active_tenant_id();

-- 3. v_anomalies_without_runbook: uses is_current_super_admin() but no tenant filter
DROP VIEW IF EXISTS public.v_anomalies_without_runbook;
CREATE VIEW public.v_anomalies_without_runbook
WITH (security_invoker=on, security_barrier=true) AS
SELECT DISTINCT anomaly_type
FROM v_job_health_anomalies
WHERE NOT (anomaly_type IN (SELECT anomaly_type FROM runbooks))
  AND auth.uid() IS NOT NULL;

-- 4. v_incident_groups_with_slo: uses is_current_super_admin() but no tenant filter
-- incident_groups tracks cross-tenant patterns, so super_admin access is appropriate
-- but we should still require auth
DROP VIEW IF EXISTS public.v_incident_groups_with_slo;
CREATE VIEW public.v_incident_groups_with_slo
WITH (security_invoker=on, security_barrier=true) AS
SELECT ig.id, ig.fingerprint_hash, ig.source_type, ig.failure_class,
    ig.normalized_signature, ig.severity_hint, ig.total_occurrences,
    ig.distinct_tenants, ig.distinct_agents, ig.first_seen_at, ig.last_seen_at,
    ig.is_active, ig.is_ongoing,
    COALESCE(slo.slo_target, 99.0) AS slo_target,
    COALESCE(slo.error_budget, 0.01) AS error_budget,
    COALESCE(slo.burn_rate_1h, 0::numeric) AS burn_rate_1h,
    COALESCE(slo.burn_rate_6h, 0::numeric) AS burn_rate_6h,
    COALESCE(slo.burn_rate_24h, 0::numeric) AS burn_rate_24h,
    COALESCE(slo.budget_consumed, 0::numeric) AS budget_consumed,
    COALESCE(slo.budget_remaining, 100::numeric) AS budget_remaining,
    COALESCE(slo.status, 'ok'::text) AS slo_status,
    COALESCE(slo.occurrences_1h, 0) AS occurrences_1h,
    COALESCE(slo.occurrences_6h, 0) AS occurrences_6h,
    slo.last_evaluated_at
FROM v_incident_groups ig
LEFT JOIN incident_slo_state slo ON slo.fingerprint_id = ig.id
WHERE auth.uid() IS NOT NULL AND is_current_super_admin()
ORDER BY COALESCE(slo.burn_rate_1h, 0::numeric) DESC NULLS LAST,
    (ig.severity_hint = 'critical') DESC, ig.total_occurrences DESC;

-- 5. v_soar_execution_summary: uses is_super_admin bypass - replace with get_active_tenant_id
DROP VIEW IF EXISTS public.v_soar_execution_summary;
CREATE VIEW public.v_soar_execution_summary
WITH (security_invoker=on, security_barrier=true) AS
SELECT se.tenant_id, se.status, se.trigger_type,
    sp.name AS playbook_name,
    count(*) AS execution_count,
    max(se.created_at) AS last_execution,
    count(*) FILTER (WHERE se.status = 'completed') AS completed_count,
    count(*) FILTER (WHERE se.status = 'failed') AS failed_count
FROM soar_executions se
LEFT JOIN soar_playbooks sp ON sp.id = se.playbook_id
WHERE se.tenant_id = get_active_tenant_id()
GROUP BY se.tenant_id, se.status, se.trigger_type, sp.name;

-- 6. v_task_automation_metrics: has auth.uid() but no tenant_id filter
DROP VIEW IF EXISTS public.v_task_automation_metrics;
CREATE VIEW public.v_task_automation_metrics
WITH (security_invoker=on, security_barrier=true) AS
SELECT tenant_id,
    date_trunc('day', closed_at) AS closure_day,
    count(*) FILTER (WHERE closure_reason LIKE 'Auto-%') AS auto_closed,
    count(*) FILTER (WHERE closure_reason NOT LIKE 'Auto-%' OR closure_reason IS NULL) AS manual_closed,
    round((count(*) FILTER (WHERE closure_reason LIKE 'Auto-%'))::numeric / NULLIF(count(*), 0)::numeric * 100, 1) AS automation_rate_percent
FROM tasks
WHERE closed_at IS NOT NULL
  AND closed_at > (now() - interval '30 days')
  AND tenant_id = get_active_tenant_id()
GROUP BY tenant_id, date_trunc('day', closed_at);
