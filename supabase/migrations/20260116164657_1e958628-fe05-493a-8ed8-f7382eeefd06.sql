-- ADR-026: Create views 1-12 with get_active_tenant_id()

CREATE VIEW public.agent_installation_metrics WITH (security_invoker = on) AS
SELECT tenant_id, platform,
    count(*) FILTER (WHERE event_type = 'generated') AS total_generated,
    count(*) FILTER (WHERE event_type = 'downloaded') AS total_downloaded,
    count(*) FILTER (WHERE event_type = 'command_copied') AS total_copied,
    count(*) FILTER (WHERE event_type IN ('installed', 'post_installation')) AS total_installed,
    count(*) FILTER (WHERE success = true) AS successful_events,
    count(*) FILTER (WHERE success = false) AS failed_events,
    round(avg(installation_time_seconds) FILTER (WHERE installation_time_seconds IS NOT NULL), 2) AS avg_install_time_seconds,
    count(*) FILTER (WHERE network_connectivity = true) AS with_network,
    count(*) FILTER (WHERE network_connectivity = false) AS without_network,
    max(created_at) AS last_event_at
FROM installation_analytics
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id, platform;

CREATE VIEW public.agent_system_metrics_unified WITH (security_invoker = on) AS
SELECT id, agent_id, tenant_id, cpu_usage_percent, cpu_name, cpu_cores,
    memory_total_gb, memory_used_gb, memory_free_gb, memory_usage_percent,
    disk_total_gb, disk_used_gb, disk_free_gb, disk_usage_percent,
    network_bytes_sent, network_bytes_received, uptime_seconds, last_boot_time,
    collected_at, created_at
FROM agent_system_metrics
WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
UNION ALL
SELECT id, agent_id, tenant_id, cpu_usage_percent, cpu_name, cpu_cores,
    memory_total_gb, memory_used_gb, memory_free_gb, memory_usage_percent,
    disk_total_gb, disk_used_gb, disk_free_gb, disk_usage_percent,
    network_bytes_sent, network_bytes_received, uptime_seconds, last_boot_time,
    collected_at, created_at
FROM agent_system_metrics_partitioned
WHERE collected_at >= CURRENT_DATE - '90 days'::interval
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE VIEW public.agent_timeline_events WITH (security_invoker = on) AS
SELECT j.tenant_id, j.agent_id, j.id AS source_id, 'job' AS event_type,
    CASE WHEN j.status = 'queued' THEN 'job_queued' WHEN j.status = 'delivered' THEN 'job_delivered'
         WHEN j.status = 'completed' THEN 'job_completed' WHEN j.status = 'failed' THEN 'job_failed'
         ELSE 'job_event' END AS event_key,
    COALESCE(j.created_at, now()) AS event_time,
    jsonb_build_object('job_type', j.type, 'status', j.status, 'error_message', j.error_message) AS data
FROM jobs j WHERE j.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
UNION ALL
SELECT a.tenant_id, a.id, a.id, 'heartbeat', 'heartbeat_received', a.last_heartbeat,
    jsonb_build_object('agent_name', a.agent_name, 'hostname', a.hostname, 'os_type', a.os_type, 'agent_version', a.agent_version, 'status', a.status)
FROM agents a WHERE a.last_heartbeat IS NOT NULL AND a.last_heartbeat > now() - '24 hours'::interval
  AND (a.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
UNION ALL
SELECT m.tenant_id, m.agent_id, m.id, 'metrics', 'metrics_collected', m.collected_at,
    jsonb_build_object('cpu_usage', m.cpu_usage_percent, 'memory_usage', m.memory_usage_percent, 'disk_usage', m.disk_usage_percent)
FROM agent_system_metrics m WHERE m.collected_at > now() - '24 hours'::interval
  AND (m.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE VIEW public.agents_health_view WITH (security_invoker = on) AS
SELECT a.id, a.tenant_id, a.agent_name, a.display_name, a.hostname, a.status, a.agent_state,
    a.last_heartbeat, a.agent_version, a.os_type, a.os_version, a.enrolled_at, a.is_isolated, a.isolation_reason,
    m.cpu_usage_percent, m.memory_usage_percent, m.disk_usage_percent, m.uptime_seconds,
    m.collected_at AS metrics_collected_at,
    CASE WHEN a.last_heartbeat IS NULL THEN 'unknown' WHEN a.last_heartbeat > now() - '5 minutes'::interval THEN 'healthy'
         WHEN a.last_heartbeat > now() - '15 minutes'::interval THEN 'warning' ELSE 'critical' END AS health_status
FROM agents a LEFT JOIN LATERAL (
    SELECT cpu_usage_percent, memory_usage_percent, disk_usage_percent, uptime_seconds, collected_at
    FROM agent_system_metrics WHERE agent_id = a.id ORDER BY collected_at DESC LIMIT 1
) m ON true
WHERE a.archived_at IS NULL AND (a.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE VIEW public.agents_public WITH (security_invoker = on) AS
SELECT id, tenant_id, agent_name, hostname, status, os_type, os_version, agent_version, display_name,
    enrolled_at, last_heartbeat, agent_mode, agent_state, agent_state_reason, agent_state_changed_at
FROM agents WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

CREATE VIEW public.agents_safe WITH (security_invoker = on) AS
SELECT id, tenant_id, agent_name, hostname, status, os_type, os_version, agent_version, display_name,
    enrolled_at, last_heartbeat, agent_mode, agent_state, agent_state_reason, agent_state_changed_at,
    safe_mode_reason, safe_mode_entered_at, is_throttled, throttled_at, is_isolated, isolated_at,
    isolation_reason, archived_at, archived_reason
FROM agents WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

CREATE VIEW public.circuit_breaker_health WITH (security_invoker = on) AS
SELECT service, state, failure_count, created_at AS last_event, tenant_id,
    CASE WHEN state = 'open' THEN 'critical' WHEN state = 'half_open' THEN 'warning' ELSE 'healthy' END AS health_status
FROM circuit_breaker_events cb1
WHERE created_at = (SELECT max(cb2.created_at) FROM circuit_breaker_events cb2 WHERE cb2.service = cb1.service)
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

CREATE VIEW public.enrollment_keys_safe WITH (security_invoker = on) AS
SELECT id, tenant_id, key, description, max_uses, current_uses, is_active, created_at, expires_at, created_by
FROM enrollment_keys WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

CREATE VIEW public.installation_error_summary WITH (security_invoker = on) AS
SELECT tenant_id, platform, event_type, error_message, count(*) AS error_count, max(created_at) AS last_occurrence
FROM installation_analytics WHERE success = false AND error_message IS NOT NULL
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id, platform, event_type, error_message ORDER BY count(*) DESC;

CREATE VIEW public.installation_health_status WITH (security_invoker = on) AS
SELECT tenant_id, count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat >= now() - '5 minutes'::interval) AS active_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat < now() - '5 minutes'::interval AND last_heartbeat >= now() - '15 minutes'::interval) AS warning_agents,
    count(*) FILTER (WHERE status = 'active' AND (last_heartbeat < now() - '15 minutes'::interval OR last_heartbeat IS NULL)) AS critical_agents,
    count(*) FILTER (WHERE status = 'inactive') AS inactive_agents
FROM agents WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin() GROUP BY tenant_id;

CREATE VIEW public.installation_metrics_summary WITH (security_invoker = on) AS
SELECT tenant_id, platform, count(*) AS total_installations,
    count(*) FILTER (WHERE success = true) AS successful,
    count(*) FILTER (WHERE success = false) AS failed,
    round(avg(installation_time_seconds) FILTER (WHERE installation_time_seconds IS NOT NULL), 2) AS avg_install_time
FROM installation_analytics WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id, platform;

CREATE VIEW public.job_failure_health WITH (security_invoker = on) AS
SELECT tenant_id, date_trunc('hour', created_at) AS hour, count(*) AS total_jobs,
    count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
    round((count(*) FILTER (WHERE status = 'failed'))::numeric / NULLIF(count(*), 0)::numeric * 100, 2) AS failure_rate_pct
FROM jobs WHERE created_at > now() - '24 hours'::interval
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id, date_trunc('hour', created_at) ORDER BY date_trunc('hour', created_at) DESC;