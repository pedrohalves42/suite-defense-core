
-- ================================================
-- SECURITY FIX: Add security_invoker = true to ALL views
-- This ensures views respect RLS policies of underlying tables
-- ================================================

-- 1. Recreate agents_health_view with security_invoker
DROP VIEW IF EXISTS agents_health_view CASCADE;
CREATE VIEW agents_health_view 
WITH (security_invoker = true) AS
SELECT id,
    agent_name,
    hostname,
    os_type,
    os_version,
    agent_version,
    status,
    last_heartbeat,
    tenant_id,
    enrolled_at,
    is_throttled,
    throttle_reason,
    throttled_at,
    is_isolated,
    isolation_reason,
    isolated_at,
    safe_mode_entered_at,
    safe_mode_reason,
    CASE
        WHEN last_heartbeat IS NULL THEN 'never_connected'::text
        WHEN last_heartbeat < (now() - '00:10:00'::interval) THEN 'offline'::text
        WHEN last_heartbeat < (now() - '00:05:00'::interval) THEN 'critical'::text
        ELSE 'healthy'::text
    END AS health_status,
    EXTRACT(epoch FROM now() - last_heartbeat)::integer AS seconds_since_heartbeat
FROM agents a;

-- 2. Recreate agents_safe with security_invoker
DROP VIEW IF EXISTS agents_safe CASCADE;
CREATE VIEW agents_safe 
WITH (security_invoker = true) AS
SELECT id,
    agent_name,
    hostname,
    os_type,
    os_version,
    agent_version,
    status,
    last_heartbeat,
    tenant_id,
    enrolled_at,
    payload_hash
FROM agents a
WHERE (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- 3. Recreate audit_logs_safe with security_invoker
DROP VIEW IF EXISTS audit_logs_safe CASCADE;
CREATE VIEW audit_logs_safe 
WITH (security_invoker = true) AS
SELECT id,
    created_at,
    tenant_id,
    success,
    details,
    action,
    resource_type,
    resource_id,
    CASE
        WHEN ip_address IS NOT NULL THEN ((split_part(ip_address, '.', 1) || '.' || split_part(ip_address, '.', 2)) || '.xxx.xxx')
        ELSE NULL::text
    END AS ip_address_masked,
    user_agent
FROM audit_logs
WHERE (tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()));

-- 4. Recreate enrollment_keys_safe with security_invoker
DROP VIEW IF EXISTS enrollment_keys_safe CASCADE;
CREATE VIEW enrollment_keys_safe 
WITH (security_invoker = true) AS
SELECT id,
    tenant_id,
    description,
    (left(key, 8) || '...' || right(key, 4)) AS key_masked,
    is_active,
    max_uses,
    current_uses,
    expires_at,
    created_at,
    used_at,
    used_by_agent,
    agent_id,
    created_by
FROM enrollment_keys ek
WHERE (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- 5. Recreate v_agent_health_summary with security_invoker
DROP VIEW IF EXISTS v_agent_health_summary CASCADE;
CREATE VIEW v_agent_health_summary 
WITH (security_invoker = true) AS
SELECT id,
    agent_name,
    hostname,
    os_type,
    status,
    last_heartbeat,
    tenant_id,
    CASE
        WHEN last_heartbeat IS NULL THEN 'never_connected'::text
        WHEN last_heartbeat < (now() - '00:05:00'::interval) THEN 'offline'::text
        ELSE 'online'::text
    END AS connection_status
FROM agents a
WHERE (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- 6. Recreate v_problematic_agents with security_invoker
DROP VIEW IF EXISTS v_problematic_agents CASCADE;
CREATE VIEW v_problematic_agents 
WITH (security_invoker = true) AS
SELECT a.id,
    a.agent_name,
    a.status,
    a.enrolled_at::text AS enrolled_at,
    a.last_heartbeat::text AS last_heartbeat,
    a.hostname,
    a.os_type,
    a.tenant_id,
    t.name AS tenant_name,
    EXTRACT(epoch FROM now() - a.enrolled_at) / 60::numeric AS minutes_since_enrollment,
    CASE
        WHEN a.status = 'pending' AND a.last_heartbeat IS NULL AND a.enrolled_at < (now() - '00:30:00'::interval) THEN 'never_connected'::text
        WHEN a.last_heartbeat IS NOT NULL AND a.last_heartbeat < (now() - '24:00:00'::interval) THEN 'stale_heartbeat'::text
        WHEN a.status = 'error' THEN 'error_status'::text
        ELSE 'other'::text
    END AS issue_type,
    (SELECT count(*)::integer FROM agent_tokens at WHERE at.agent_id = a.id) AS token_count,
    (EXISTS (SELECT 1 FROM agent_tokens at WHERE at.agent_id = a.id AND at.is_active = true AND (at.expires_at IS NULL OR at.expires_at > now()))) AS has_active_token,
    (SELECT count(*)::integer FROM jobs j WHERE j.agent_id = a.id AND (j.status = ANY (ARRAY['queued', 'pending', 'delivered']))) AS pending_jobs_count
FROM agents a
JOIN tenants t ON t.id = a.tenant_id
WHERE (a.tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid())) 
AND (a.status = 'pending' AND a.last_heartbeat IS NULL AND a.enrolled_at < (now() - '00:30:00'::interval) 
     OR a.last_heartbeat IS NOT NULL AND a.last_heartbeat < (now() - '24:00:00'::interval) 
     OR a.status = 'error');

-- 7. Recreate v_problematic_jobs with security_invoker
DROP VIEW IF EXISTS v_problematic_jobs CASCADE;
CREATE VIEW v_problematic_jobs 
WITH (security_invoker = true) AS
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
        WHEN status = 'queued' AND created_at < (now() - '01:00:00'::interval) THEN 'stuck_queued'::text
        WHEN status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval) THEN 'stuck_delivered'::text
        WHEN status = 'failed' AND error_message IS NOT NULL THEN 'failed_with_error'::text
        WHEN status = 'failed' THEN 'failed_silent'::text
        ELSE 'unknown'::text
    END AS problem_type,
    EXTRACT(epoch FROM now() - COALESCE(delivered_at, created_at)) / 60 AS minutes_stuck
FROM jobs j
WHERE (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()))
AND (
    (status = 'queued' AND created_at < (now() - '01:00:00'::interval))
    OR (status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval))
    OR status = 'failed'
);

-- 8. Recreate v_stuck_jobs_report with security_invoker
DROP VIEW IF EXISTS v_stuck_jobs_report CASCADE;
CREATE VIEW v_stuck_jobs_report 
WITH (security_invoker = true) AS
SELECT id,
    agent_name,
    type,
    status,
    tenant_id,
    created_at,
    delivered_at,
    EXTRACT(epoch FROM now() - COALESCE(delivered_at, created_at)) / 60::numeric AS minutes_stuck,
    CASE
        WHEN status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval) THEN 'stuck_delivered'::text
        WHEN status = 'queued' AND created_at < (now() - '02:00:00'::interval) THEN 'stuck_queued'::text
        WHEN status = 'pending' AND created_at < (now() - '01:00:00'::interval) THEN 'stuck_pending'::text
        ELSE 'normal'::text
    END AS problem_type
FROM jobs j
WHERE (tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())) 
AND (status = 'delivered' AND delivered_at < (now() - '00:30:00'::interval) 
     OR status = 'queued' AND created_at < (now() - '02:00:00'::interval) 
     OR status = 'pending' AND created_at < (now() - '01:00:00'::interval));

-- 9. Recreate v_job_execution_health with security_invoker
DROP VIEW IF EXISTS v_job_execution_health CASCADE;
CREATE VIEW v_job_execution_health 
WITH (security_invoker = true) AS
SELECT j.tenant_id,
    count(*) FILTER (WHERE j.status = 'delivered') AS delivered_count,
    count(*) FILTER (WHERE j.status = 'completed') AS completed_count,
    count(*) FILTER (WHERE j.status = 'failed') AS failed_count,
    count(*) FILTER (WHERE j.status = 'completed' AND j.finished_at > j.expires_at) AS expired_completed_count,
    count(*) FILTER (WHERE (j.id IN (SELECT je2.job_id FROM job_executions je2 GROUP BY je2.job_id HAVING count(*) > 1))) AS duplicate_execution_jobs,
    avg(EXTRACT(epoch FROM j.delivered_at - j.created_at)) AS avg_queue_time_seconds,
    avg(je.execution_time_seconds) FILTER (WHERE j.status = 'completed') AS avg_execution_time_seconds,
    now() AS calculated_at
FROM jobs j
LEFT JOIN job_executions je ON j.current_execution_id = je.id
WHERE j.created_at > (now() - '24:00:00'::interval)
GROUP BY j.tenant_id;

-- 10. Recreate v_soc2_readiness with security_invoker
DROP VIEW IF EXISTS v_soc2_readiness CASCADE;
CREATE VIEW v_soc2_readiness 
WITH (security_invoker = true) AS
SELECT sc.tenant_id,
    sc.criteria_code,
    sc.criteria_name,
    sc.status AS criteria_status,
    count(ctrl.id) AS total_controls,
    count(CASE WHEN ctrl.status = 'verified' THEN 1 ELSE NULL END) AS verified_controls,
    count(CASE WHEN ctrl.status = 'implemented' THEN 1 ELSE NULL END) AS implemented_controls,
    count(CASE WHEN ctrl.status = 'in_progress' THEN 1 ELSE NULL END) AS in_progress_controls,
    count(CASE WHEN ctrl.status = 'not_started' THEN 1 ELSE NULL END) AS not_started_controls,
    CASE
        WHEN count(ctrl.id) = 0 THEN 0::numeric
        ELSE round((count(CASE WHEN ctrl.status = 'verified' THEN 1 ELSE NULL END)::numeric * 100 + 
                   count(CASE WHEN ctrl.status = 'implemented' THEN 1 ELSE NULL END)::numeric * 75 + 
                   count(CASE WHEN ctrl.status = 'in_progress' THEN 1 ELSE NULL END)::numeric * 25) / count(ctrl.id)::numeric)
    END AS criteria_readiness_score
FROM soc2_criteria sc
LEFT JOIN soc2_controls ctrl ON ctrl.criteria_id = sc.id
GROUP BY sc.tenant_id, sc.criteria_code, sc.criteria_name, sc.status;

-- 11. Recreate v_system_operations_summary with security_invoker
DROP VIEW IF EXISTS v_system_operations_summary CASCADE;
CREATE VIEW v_system_operations_summary 
WITH (security_invoker = true) AS
SELECT id AS tenant_id,
    name AS tenant_name,
    (SELECT count(*) FROM agents WHERE agents.tenant_id = t.id) AS total_agents,
    (SELECT count(*) FROM agents WHERE agents.tenant_id = t.id AND agents.last_heartbeat > (now() - '00:05:00'::interval)) AS online_agents,
    (SELECT count(*) FROM agents WHERE agents.tenant_id = t.id AND (agents.last_heartbeat IS NULL OR agents.last_heartbeat < (now() - '00:30:00'::interval))) AS offline_agents,
    (SELECT count(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.created_at > (now() - '24:00:00'::interval)) AS jobs_24h,
    (SELECT count(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.status = 'completed' AND jobs.created_at > (now() - '24:00:00'::interval)) AS jobs_completed_24h,
    (SELECT count(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.status = 'failed' AND jobs.created_at > (now() - '24:00:00'::interval)) AS jobs_failed_24h,
    (SELECT count(*) FROM system_alerts WHERE system_alerts.tenant_id = t.id AND system_alerts.acknowledged = false) AS open_alerts
FROM tenants t;

-- 12. Recreate v_tenant_plan_status with security_invoker (simplified - no plan column)
DROP VIEW IF EXISTS v_tenant_plan_status CASCADE;
CREATE VIEW v_tenant_plan_status 
WITH (security_invoker = true) AS
SELECT 
    t.id AS tenant_id,
    t.name AS tenant_name,
    COALESCE(tf.quota_limit, 100) AS max_agents,
    (SELECT count(*) FROM agents WHERE agents.tenant_id = t.id) AS current_agents,
    CASE 
        WHEN COALESCE(tf.quota_limit, 100) > 0 AND (SELECT count(*) FROM agents WHERE agents.tenant_id = t.id) >= COALESCE(tf.quota_limit, 100) THEN 'limit_reached'
        WHEN COALESCE(tf.quota_limit, 100) > 0 AND (SELECT count(*) FROM agents WHERE agents.tenant_id = t.id) >= (COALESCE(tf.quota_limit, 100) * 0.9) THEN 'near_limit'
        ELSE 'ok'
    END AS agent_limit_status
FROM tenants t
LEFT JOIN tenant_features tf ON tf.tenant_id = t.id AND tf.feature_key = 'max_devices';

-- 13. Recreate agent_installation_metrics with security_invoker
DROP VIEW IF EXISTS agent_installation_metrics CASCADE;
CREATE VIEW agent_installation_metrics 
WITH (security_invoker = true) AS
SELECT tenant_id,
    platform,
    count(*) FILTER (WHERE event_type = 'generated') AS total_generated,
    count(*) FILTER (WHERE event_type = 'downloaded') AS total_downloaded,
    count(*) FILTER (WHERE event_type = 'command_copied') AS total_copied,
    count(*) FILTER (WHERE event_type = ANY (ARRAY['installed', 'post_installation'])) AS total_installed,
    count(*) FILTER (WHERE success = true) AS successful_events,
    count(*) FILTER (WHERE success = false) AS failed_events,
    round(avg(installation_time_seconds) FILTER (WHERE installation_time_seconds IS NOT NULL), 2) AS avg_install_time_seconds,
    count(*) FILTER (WHERE network_connectivity = true) AS with_network,
    count(*) FILTER (WHERE network_connectivity = false) AS without_network,
    max(created_at) AS last_event_at
FROM installation_analytics ia
WHERE (tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()))
GROUP BY tenant_id, platform;

-- 14. Recreate agent_releases_public with security_invoker
DROP VIEW IF EXISTS agent_releases_public CASCADE;
CREATE VIEW agent_releases_public 
WITH (security_invoker = true) AS
SELECT id,
    version,
    platform,
    channel,
    sha256,
    release_notes,
    is_active,
    created_at
FROM agent_releases
WHERE is_active = true AND (EXISTS (SELECT 1 FROM user_roles WHERE user_roles.user_id = auth.uid()));

-- 15. Recreate agent_system_metrics_unified with security_invoker
DROP VIEW IF EXISTS agent_system_metrics_unified CASCADE;
CREATE VIEW agent_system_metrics_unified 
WITH (security_invoker = true) AS
SELECT asm.id,
    asm.agent_id,
    asm.tenant_id,
    asm.cpu_usage_percent,
    asm.cpu_name,
    asm.cpu_cores,
    asm.memory_total_gb,
    asm.memory_used_gb,
    asm.memory_free_gb,
    asm.memory_usage_percent,
    asm.disk_total_gb,
    asm.disk_used_gb,
    asm.disk_free_gb,
    asm.disk_usage_percent,
    asm.network_bytes_sent,
    asm.network_bytes_received,
    asm.uptime_seconds,
    asm.last_boot_time,
    asm.collected_at,
    asm.created_at
FROM agent_system_metrics asm
WHERE (asm.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()))
UNION ALL
SELECT asmp.id,
    asmp.agent_id,
    asmp.tenant_id,
    asmp.cpu_usage_percent,
    asmp.cpu_name,
    asmp.cpu_cores,
    asmp.memory_total_gb,
    asmp.memory_used_gb,
    asmp.memory_free_gb,
    asmp.memory_usage_percent,
    asmp.disk_total_gb,
    asmp.disk_used_gb,
    asmp.disk_free_gb,
    asmp.disk_usage_percent,
    asmp.network_bytes_sent,
    asmp.network_bytes_received,
    asmp.uptime_seconds,
    asmp.last_boot_time,
    asmp.collected_at,
    asmp.created_at
FROM agent_system_metrics_partitioned asmp
WHERE asmp.collected_at >= (CURRENT_DATE - '90 days'::interval) 
AND (asmp.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()));

-- 16. Recreate agent_timeline_events with security_invoker
DROP VIEW IF EXISTS agent_timeline_events CASCADE;
CREATE VIEW agent_timeline_events 
WITH (security_invoker = true) AS
SELECT j.tenant_id,
    j.agent_id,
    j.id AS source_id,
    'job'::text AS event_type,
    CASE
        WHEN j.status = 'queued' THEN 'job_queued'
        WHEN j.status = 'delivered' THEN 'job_delivered'
        WHEN j.status = 'completed' THEN 'job_completed'
        WHEN j.status = 'failed' THEN 'job_failed'
        ELSE 'job_event'
    END AS event_key,
    COALESCE(j.created_at, now()) AS event_time,
    jsonb_build_object('job_type', j.type, 'status', j.status, 'error_message', j.error_message) AS data
FROM jobs j
WHERE (j.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()))
UNION ALL
SELECT a.tenant_id,
    a.id AS agent_id,
    a.id AS source_id,
    'heartbeat'::text AS event_type,
    'heartbeat_received'::text AS event_key,
    a.last_heartbeat AS event_time,
    jsonb_build_object('agent_name', a.agent_name, 'hostname', a.hostname, 'os_type', a.os_type, 'agent_version', a.agent_version, 'status', a.status) AS data
FROM agents a
WHERE (a.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())) 
AND a.last_heartbeat IS NOT NULL AND a.last_heartbeat > (now() - '24:00:00'::interval)
UNION ALL
SELECT m.tenant_id,
    m.agent_id,
    m.id AS source_id,
    'metrics'::text AS event_type,
    'metrics_collected'::text AS event_key,
    m.collected_at AS event_time,
    jsonb_build_object('cpu_usage', m.cpu_usage_percent, 'memory_usage', m.memory_usage_percent, 'disk_usage', m.disk_usage_percent) AS data
FROM agent_system_metrics m
WHERE (m.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())) 
AND m.collected_at > (now() - '24:00:00'::interval)
UNION ALL
SELECT sa.tenant_id,
    sa.agent_id,
    sa.id AS source_id,
    'alert'::text AS event_type,
    sa.alert_type AS event_key,
    sa.created_at AS event_time,
    jsonb_build_object('message', sa.message, 'severity', sa.severity, 'acknowledged', sa.acknowledged) AS data
FROM system_alerts sa
WHERE (sa.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())) 
AND sa.created_at > (now() - '24:00:00'::interval);

-- 17. Recreate hmac_signatures with security_invoker (admin only)
DROP VIEW IF EXISTS hmac_signatures CASCADE;
CREATE VIEW hmac_signatures 
WITH (security_invoker = true) AS
SELECT 
    a.id AS agent_id,
    a.agent_name,
    a.tenant_id,
    a.hmac_secret,
    a.signature_mode,
    a.result_public_key,
    a.result_key_fingerprint
FROM agents a
WHERE EXISTS (
    SELECT 1 FROM user_roles ur 
    WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin')
    AND ur.tenant_id = a.tenant_id
);

-- 18. Recreate rate_limit_stats with security_invoker (admin only)
DROP VIEW IF EXISTS rate_limit_stats CASCADE;
CREATE VIEW rate_limit_stats 
WITH (security_invoker = true) AS
SELECT endpoint,
    identifier,
    request_count,
    window_start,
    blocked_until,
    blocked_until > now() AS is_blocked
FROM rate_limits rl
WHERE (EXISTS (SELECT 1 FROM user_roles ur WHERE ur.user_id = auth.uid() AND (ur.role = ANY (ARRAY['admin'::app_role, 'super_admin'::app_role]))));

-- 19. Recreate jobs_normalized with security_invoker
DROP VIEW IF EXISTS jobs_normalized CASCADE;
CREATE VIEW jobs_normalized 
WITH (security_invoker = true) AS
SELECT id,
    tenant_id,
    agent_id,
    agent_name,
    type,
    status,
    status AS normalized_status,
    payload,
    output,
    error_message,
    approved,
    created_at,
    scheduled_at,
    delivered_at,
    started_at,
    completed_at,
    finished_at,
    execution_time_seconds,
    execution_time_seconds AS duration_seconds,
    is_recurring,
    recurrence_pattern,
    next_run_at,
    last_run_at,
    parent_job_id,
    CASE
        WHEN started_at IS NOT NULL OR finished_at IS NOT NULL THEN true
        ELSE false
    END AS is_v3,
    CASE
        WHEN status = 'queued' AND created_at < (now() - '01:00:00'::interval) THEN true
        WHEN status = 'delivered' AND delivered_at < (now() - '01:00:00'::interval) THEN true
        ELSE false
    END AS is_stuck
FROM jobs
WHERE (tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()));

-- 20. Recreate job_integrity_violations with security_invoker
DROP VIEW IF EXISTS job_integrity_violations CASCADE;
CREATE VIEW job_integrity_violations 
WITH (security_invoker = true) AS
SELECT id AS job_id,
    agent_id,
    type AS job_type,
    status,
    created_at AS job_created_at,
    completed_at,
    CASE
        WHEN type = 'collect_web_activity' AND NOT (EXISTS (SELECT 1 FROM agent_web_activity aw WHERE aw.agent_id = j.agent_id AND (aw.created_at >= j.created_at OR aw.visited_at >= j.created_at))) THEN 'missing_web_activity'
        WHEN type = 'collect_system_metrics' AND NOT (EXISTS (SELECT 1 FROM agent_system_metrics asm WHERE asm.agent_id = j.agent_id AND asm.created_at >= j.created_at)) THEN 'missing_metrics'
        ELSE NULL
    END AS violation_type
FROM jobs j
WHERE status = 'completed' AND created_at > (now() - '7 days'::interval);

-- 21. Recreate installation_error_summary with security_invoker
DROP VIEW IF EXISTS installation_error_summary CASCADE;
CREATE VIEW installation_error_summary 
WITH (security_invoker = true) AS
SELECT tenant_id,
    platform,
    event_type,
    error_message,
    count(*) AS error_count,
    max(created_at) AS last_occurrence
FROM installation_analytics ia
WHERE success = false AND error_message IS NOT NULL 
AND (tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()))
GROUP BY tenant_id, platform, event_type, error_message
ORDER BY count(*) DESC;

-- 22. Recreate installation_health_status with security_invoker
DROP VIEW IF EXISTS installation_health_status CASCADE;
CREATE VIEW installation_health_status 
WITH (security_invoker = true) AS
SELECT tenant_id,
    count(*) AS total_agents,
    count(*) FILTER (WHERE status = 'active' AND last_heartbeat >= (now() - '00:05:00'::interval)) AS active_agents,
    count(*) FILTER (WHERE status = 'pending') AS pending_agents,
    count(*) FILTER (WHERE status = 'active' AND (last_heartbeat IS NULL OR last_heartbeat < (now() - '00:30:00'::interval))) AS stuck_agents,
    CASE
        WHEN count(*) > 0 THEN round(count(*) FILTER (WHERE status = 'active')::numeric / count(*)::numeric * 100, 1)
        ELSE 0::numeric
    END AS activation_rate_pct,
    'last_24h'::text AS window_interval
FROM agents a
WHERE enrolled_at > (now() - '24:00:00'::interval) 
AND (tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()))
GROUP BY tenant_id;

-- 23. Recreate installation_metrics_summary with security_invoker
DROP VIEW IF EXISTS installation_metrics_summary CASCADE;
CREATE VIEW installation_metrics_summary 
WITH (security_invoker = true) AS
SELECT tenant_id,
    platform,
    event_type,
    count(*) AS event_count,
    date_trunc('day', created_at) AS date
FROM installation_analytics
WHERE (tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid()))
GROUP BY tenant_id, platform, event_type, date_trunc('day', created_at);

-- 24. Recreate v_agent_execution_health with security_invoker
DROP VIEW IF EXISTS v_agent_execution_health CASCADE;
CREATE VIEW v_agent_execution_health 
WITH (security_invoker = true) AS
SELECT a.id AS agent_id,
    a.agent_name,
    a.tenant_id,
    a.status,
    a.last_heartbeat,
    a.agent_mode,
    a.agent_version,
    round(EXTRACT(epoch FROM now() - a.last_heartbeat) / 60::numeric) AS minutes_since_heartbeat,
    je.last_execution_at,
    round(EXTRACT(epoch FROM now() - je.last_execution_at) / 60::numeric) AS minutes_since_execution,
    COALESCE(stale_q.stale_queued_jobs, 0::bigint) AS stale_queued_jobs,
    COALESCE(stale_d.stale_delivered_jobs, 0::bigint) AS stale_delivered_jobs,
    COALESCE(pending.pending_jobs, 0::bigint) AS pending_jobs,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'never_connected'
        WHEN a.last_heartbeat < (now() - '00:30:00'::interval) THEN 'offline'
        WHEN a.agent_mode = 'SAFE_MODE' THEN 'safe_mode'
        WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 3 THEN 'not_polling_jobs'
        WHEN COALESCE(stale_d.stale_delivered_jobs, 0::bigint) > 2 THEN 'not_executing_jobs'
        WHEN je.last_execution_at IS NOT NULL AND je.last_execution_at < (now() - '04:00:00'::interval) AND COALESCE(pending.pending_jobs, 0::bigint) > 0 THEN 'execution_stale'
        ELSE 'healthy'
    END AS health_status,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'critical'
        WHEN a.last_heartbeat < (now() - '00:30:00'::interval) THEN 'high'
        WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 10 THEN 'critical'
        WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 5 THEN 'high'
        WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 3 THEN 'medium'
        WHEN COALESCE(stale_d.stale_delivered_jobs, 0::bigint) > 2 THEN 'medium'
        ELSE 'low'
    END AS severity,
    CASE
        WHEN a.last_heartbeat IS NULL THEN 'Agente nunca conectou ao sistema'
        WHEN a.last_heartbeat < (now() - '00:30:00'::interval) THEN 'Agente offline ha mais de 30 minutos'
        WHEN a.agent_mode = 'SAFE_MODE' THEN 'Agente em modo seguro - execucao limitada'
        WHEN COALESCE(stale_q.stale_queued_jobs, 0::bigint) > 3 THEN 'Agente online mas nao esta buscando jobs ha mais de 1 hora'
        WHEN COALESCE(stale_d.stale_delivered_jobs, 0::bigint) > 2 THEN 'Agente recebeu jobs mas nao esta executando ha mais de 30 minutos'
        WHEN je.last_execution_at IS NOT NULL AND je.last_execution_at < (now() - '04:00:00'::interval) AND COALESCE(pending.pending_jobs, 0::bigint) > 0 THEN 'Ultima execucao ha mais de 4 horas com jobs pendentes'
        ELSE 'Agente funcionando normalmente'
    END AS health_description,
    now() AS checked_at
FROM agents a
LEFT JOIN LATERAL (SELECT max(je_1.finished_at) AS last_execution_at FROM job_executions je_1 WHERE je_1.agent_id = a.id) je ON true
LEFT JOIN LATERAL (SELECT count(*) AS stale_queued_jobs FROM jobs j WHERE j.agent_id = a.id AND j.status = 'queued' AND j.created_at < (now() - '01:00:00'::interval)) stale_q ON true
LEFT JOIN LATERAL (SELECT count(*) AS stale_delivered_jobs FROM jobs j WHERE j.agent_id = a.id AND j.status = 'delivered' AND j.delivered_at < (now() - '00:30:00'::interval)) stale_d ON true
LEFT JOIN LATERAL (SELECT count(*) AS pending_jobs FROM jobs j WHERE j.agent_id = a.id AND (j.status = ANY (ARRAY['queued', 'delivered']))) pending ON true
WHERE a.status = 'active';

-- 25. Recreate v_agent_lifecycle_state with security_invoker
DROP VIEW IF EXISTS v_agent_lifecycle_state CASCADE;
CREATE VIEW v_agent_lifecycle_state 
WITH (security_invoker = true) AS
SELECT id AS agent_id,
    agent_name,
    tenant_id,
    status AS agent_status,
    enrolled_at::text AS enrolled_at,
    last_heartbeat::text AS last_heartbeat,
    os_type,
    os_version,
    hostname,
    (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'generated' ORDER BY ia.created_at DESC LIMIT 1) AS generated_at,
    (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded' ORDER BY ia.created_at DESC LIMIT 1) AS downloaded_at,
    (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied' ORDER BY ia.created_at DESC LIMIT 1) AS command_copied_at,
    (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND (ia.event_type = ANY (ARRAY['installed', 'post_installation'])) ORDER BY ia.created_at DESC LIMIT 1) AS installed_at,
    CASE
        WHEN status = 'active' AND last_heartbeat > (now() - '00:05:00'::interval) THEN 'active'
        WHEN (EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND (ia.event_type = ANY (ARRAY['installed', 'post_installation'])))) THEN 'installed_offline'
        WHEN (EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied')) THEN 'installing'
        WHEN (EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded')) THEN 'downloaded'
        WHEN (EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'generated')) THEN 'generated'
        ELSE 'unknown'
    END AS lifecycle_stage,
    (SELECT ia.installation_time_seconds FROM installation_analytics ia WHERE ia.agent_id = a.id AND (ia.event_type = ANY (ARRAY['installed', 'post_installation'])) AND ia.success = true ORDER BY ia.created_at DESC LIMIT 1) AS installation_time_seconds,
    (SELECT ia.success FROM installation_analytics ia WHERE ia.agent_id = a.id AND (ia.event_type = ANY (ARRAY['installed', 'post_installation'])) ORDER BY ia.created_at DESC LIMIT 1) AS installation_success,
    (SELECT ia.network_connectivity FROM installation_analytics ia WHERE ia.agent_id = a.id AND (ia.event_type = ANY (ARRAY['installed', 'post_installation'])) ORDER BY ia.created_at DESC LIMIT 1) AS network_connectivity,
    (SELECT ia.error_message FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.success = false ORDER BY ia.created_at DESC LIMIT 1) AS last_error_message,
    (SELECT ia.created_at::text FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.success = false ORDER BY ia.created_at DESC LIMIT 1) AS last_error_at,
    (SELECT ia.platform FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS platform,
    (SELECT ia.installation_method FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS installation_method,
    (SELECT ia.metadata FROM installation_analytics ia WHERE ia.agent_id = a.id ORDER BY ia.created_at DESC LIMIT 1) AS installation_metadata,
    EXTRACT(epoch FROM now() - last_heartbeat) / 60::numeric AS minutes_since_heartbeat,
    EXTRACT(epoch FROM now() - enrolled_at) / 60::numeric AS minutes_since_enrollment,
    (SELECT EXTRACT(epoch FROM ((SELECT ia2.created_at FROM installation_analytics ia2 WHERE ia2.agent_id = a.id AND (ia2.event_type = ANY (ARRAY['installed', 'post_installation'])) ORDER BY ia2.created_at DESC LIMIT 1) - (SELECT ia3.created_at FROM installation_analytics ia3 WHERE ia3.agent_id = a.id AND ia3.event_type = 'command_copied' ORDER BY ia3.created_at DESC LIMIT 1))) / 60::numeric) AS minutes_between_copy_and_install,
    (EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied')) AND NOT (EXISTS (SELECT 1 FROM installation_analytics ia WHERE ia.agent_id = a.id AND (ia.event_type = ANY (ARRAY['installed', 'post_installation'])))) AND ((SELECT ia.created_at FROM installation_analytics ia WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied' ORDER BY ia.created_at DESC LIMIT 1)) < (now() - '00:30:00'::interval) AS is_stuck
FROM agents a
WHERE (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- 26. Recreate v_confidence_gap_trend with security_invoker
DROP VIEW IF EXISTS v_confidence_gap_trend CASCADE;
CREATE VIEW v_confidence_gap_trend 
WITH (security_invoker = true) AS
WITH base_data AS (
    SELECT cg.id, cg.tenant_id, cg.audit_id, cg.red_team_id, cg.ana_score, cg.red_score,
        cg.confidence_gap, cg.health_status, cg.previous_gap, cg.gap_delta, cg.alert_triggered,
        cg.alert_reason, cg.dimension_gaps, cg.created_at,
        lag(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at) AS prev_gap,
        avg(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at ROWS BETWEEN 30 PRECEDING AND CURRENT ROW) AS avg_gap_30d,
        avg(cg.confidence_gap) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at ROWS BETWEEN 90 PRECEDING AND CURRENT ROW) AS avg_gap_90d
    FROM audit_confidence_gaps cg
), with_decrease_flag AS (
    SELECT bd.*, CASE WHEN bd.confidence_gap < COALESCE(bd.prev_gap, bd.confidence_gap) THEN 1 ELSE 0 END AS is_decrease
    FROM base_data bd
), with_consecutive AS (
    SELECT wdf.*, sum(wdf.is_decrease) OVER (PARTITION BY wdf.tenant_id ORDER BY wdf.created_at ROWS BETWEEN 3 PRECEDING AND CURRENT ROW) AS consecutive_decrease_count
    FROM with_decrease_flag wdf
)
SELECT id, tenant_id, created_at, ana_score, red_score, confidence_gap, health_status,
    confidence_gap - COALESCE(prev_gap, confidence_gap) AS gap_delta, alert_triggered,
    round(avg_gap_30d, 1) AS avg_gap_30d, round(avg_gap_90d, 1) AS avg_gap_90d,
    CASE WHEN avg_gap_90d IS NOT NULL AND prev_gap IS NOT NULL THEN round(confidence_gap::numeric - avg_gap_90d, 1) ELSE NULL::numeric END AS gap_change,
    CASE WHEN confidence_gap::numeric > (avg_gap_90d + 5::numeric) THEN 'improving' WHEN confidence_gap::numeric < (avg_gap_90d - 5::numeric) THEN 'degrading' ELSE 'stable' END AS trend_direction,
    consecutive_decrease_count >= 3 AS consecutive_decrease, consecutive_decrease_count::integer AS consecutive_alerts
FROM with_consecutive wc ORDER BY tenant_id, created_at DESC;

-- 27. Recreate v_edge_function_stats with security_invoker
DROP VIEW IF EXISTS v_edge_function_stats CASCADE;
CREATE VIEW v_edge_function_stats 
WITH (security_invoker = true) AS
SELECT function_name, count(*) AS total_calls,
    count(*) FILTER (WHERE success = true) AS successful_calls,
    count(*) FILTER (WHERE success = false) AS failed_calls,
    round(avg(latency_ms), 2) AS avg_latency_ms,
    percentile_cont(0.5) WITHIN GROUP (ORDER BY latency_ms::double precision) AS p50_latency_ms,
    percentile_cont(0.95) WITHIN GROUP (ORDER BY latency_ms::double precision) AS p95_latency_ms,
    percentile_cont(0.99) WITHIN GROUP (ORDER BY latency_ms::double precision) AS p99_latency_ms,
    min(latency_ms) AS min_latency_ms, max(latency_ms) AS max_latency_ms,
    min(created_at) AS first_call, max(created_at) AS last_call
FROM edge_function_metrics WHERE created_at > (now() - '24:00:00'::interval) GROUP BY function_name ORDER BY count(*) DESC;

-- 28. Recreate v_execution_chain_health with security_invoker
DROP VIEW IF EXISTS v_execution_chain_health CASCADE;
CREATE VIEW v_execution_chain_health 
WITH (security_invoker = true) AS
SELECT aec.agent_id, a.agent_name, a.status AS agent_status,
    aec.last_execution_index AS chain_index, COALESCE(max(je.execution_index), 0::bigint) AS actual_max_index,
    CASE WHEN COALESCE(max(je.execution_index), 0::bigint) > aec.last_execution_index THEN 'DESSINCRONIZADO'
         WHEN COALESCE(max(je.execution_index), 0::bigint) < aec.last_execution_index THEN 'CHAIN_AHEAD' ELSE 'OK' END AS sync_status,
    aec.updated_at AS chain_updated_at
FROM agent_execution_chain aec JOIN agents a ON a.id = aec.agent_id LEFT JOIN job_executions je ON je.agent_id = aec.agent_id
GROUP BY aec.agent_id, a.agent_name, a.status, aec.last_execution_index, aec.updated_at;

-- 29. Recreate v_integrity_score with security_invoker
DROP VIEW IF EXISTS v_integrity_score CASCADE;
CREATE VIEW v_integrity_score 
WITH (security_invoker = true) AS
WITH supply_chain_stats AS (
    SELECT count(*) FILTER (WHERE is_active = true) AS active_releases,
        count(*) FILTER (WHERE is_active = true AND sha256 IS NOT NULL AND length(sha256) = 64 AND CASE WHEN platform = 'windows' THEN length(script_content) >= 50000 ELSE length(script_content) >= 30000 END) AS valid_active_releases,
        count(*) AS total_releases, count(*) FILTER (WHERE is_active = false) AS archived_releases FROM agent_releases
), job_integrity_stats AS (
    SELECT count(*) AS total_jobs, count(*) FILTER (WHERE status = 'completed' AND output IS NOT NULL AND output::text <> '{}' AND output::text <> 'null') AS valid_completed_jobs,
        count(*) FILTER (WHERE status = 'completed') AS completed_jobs,
        count(*) FILTER (WHERE status = 'completed' AND (output IS NULL OR output::text = '{}' OR output::text = 'null')) AS completed_without_output
    FROM jobs WHERE created_at > (now() - '7 days'::interval)
), failed_job_stats AS (
    SELECT count(*) AS failed_jobs, count(*) FILTER (WHERE error_message IS NOT NULL AND error_message <> '') AS failed_with_error
    FROM jobs WHERE status = 'failed' AND created_at > (now() - '7 days'::interval)
)
SELECT CASE WHEN sc.active_releases = 0 THEN 100.0 ELSE round(sc.valid_active_releases::numeric / sc.active_releases::numeric * 100, 1) END AS supply_chain_score,
    CASE WHEN ji.completed_jobs = 0 THEN 100.0 ELSE round(ji.valid_completed_jobs::numeric / ji.completed_jobs::numeric * 100, 1) END AS job_integrity_score,
    CASE WHEN fj.failed_jobs = 0 THEN 100.0 ELSE round(fj.failed_with_error::numeric / fj.failed_jobs::numeric * 100, 1) END AS failed_jobs_score,
    round((CASE WHEN sc.active_releases = 0 THEN 100.0 ELSE sc.valid_active_releases::numeric / sc.active_releases::numeric * 100 END +
           CASE WHEN ji.completed_jobs = 0 THEN 100.0 ELSE ji.valid_completed_jobs::numeric / ji.completed_jobs::numeric * 100 END +
           CASE WHEN fj.failed_jobs = 0 THEN 100.0 ELSE fj.failed_with_error::numeric / fj.failed_jobs::numeric * 100 END) / 3, 1) AS global_integrity_score,
    sc.active_releases, sc.valid_active_releases, sc.archived_releases, sc.total_releases,
    ji.total_jobs, ji.completed_jobs, ji.valid_completed_jobs, ji.completed_without_output,
    fj.failed_jobs, fj.failed_with_error, now() AS calculated_at
FROM supply_chain_stats sc CROSS JOIN job_integrity_stats ji CROSS JOIN failed_job_stats fj;

-- 30. Recreate v_job_hourly_trends with security_invoker
DROP VIEW IF EXISTS v_job_hourly_trends CASCADE;
CREATE VIEW v_job_hourly_trends 
WITH (security_invoker = true) AS
SELECT tenant_id, date_trunc('hour', created_at) AS hour, count(*) AS total,
    count(*) FILTER (WHERE status = 'completed') AS completed, count(*) FILTER (WHERE status = 'failed') AS failed,
    round(count(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(count(*), 0)::numeric * 100, 1) AS success_rate_pct
FROM jobs WHERE created_at > (now() - '24:00:00'::interval) GROUP BY tenant_id, date_trunc('hour', created_at) ORDER BY date_trunc('hour', created_at) DESC;

-- 31. Recreate v_job_metrics_by_type with security_invoker
DROP VIEW IF EXISTS v_job_metrics_by_type CASCADE;
CREATE VIEW v_job_metrics_by_type 
WITH (security_invoker = true) AS
SELECT tenant_id, type, count(*) AS total_jobs, count(*) FILTER (WHERE status = 'completed') AS completed,
    count(*) FILTER (WHERE status = 'failed') AS failed, count(*) FILTER (WHERE status = 'queued') AS queued,
    count(*) FILTER (WHERE status = 'delivered') AS delivered,
    count(*) FILTER (WHERE status = 'delivered' AND delivered_at < (now() - '01:00:00'::interval)) AS stuck,
    round(avg(EXTRACT(epoch FROM completed_at - created_at)), 2) AS avg_execution_seconds,
    round(count(*) FILTER (WHERE status = 'completed')::numeric / NULLIF(count(*), 0)::numeric * 100, 1) AS success_rate_pct
FROM jobs WHERE created_at > (now() - '24:00:00'::interval) GROUP BY tenant_id, type;

-- 32. Recreate v_jobs_status_corrected with security_invoker
DROP VIEW IF EXISTS v_jobs_status_corrected CASCADE;
CREATE VIEW v_jobs_status_corrected 
WITH (security_invoker = true) AS
SELECT id, agent_name, type, payload, approved, status, created_at, delivered_at, completed_at,
    tenant_id, scheduled_at, is_recurring, recurrence_pattern, parent_job_id, last_run_at, next_run_at,
    output, error_message, started_at, finished_at, execution_time_seconds, agent_id, priority,
    delivery_attempts, expires_at, current_execution_id, payload_hash,
    CASE WHEN status = 'failed' AND (error_message ~~* '%Auto-cleanup%' OR error_message ~~* '%Zombie TTL%' OR error_message ~~* '%exceeded max delivery attempts%' OR error_message ~~* '%expired before%' OR error_message ~~* '%Stuck job%') THEN 'cancelled_timeout'
         WHEN status = 'failed' AND error_message ~~* '%delivered but%' THEN 'cancelled_no_response' ELSE status END AS corrected_status,
    CASE WHEN status = 'failed' AND (error_message ~~* '%Auto-cleanup%' OR error_message ~~* '%Zombie TTL%' OR error_message ~~* '%exceeded max delivery attempts%' OR error_message ~~* '%expired before%' OR error_message ~~* '%Stuck job%' OR error_message ~~* '%delivered but%') THEN false
         ELSE status = 'failed' END AS is_real_failure
FROM jobs j;

-- 33. Recreate v_pipeline_health_metrics with security_invoker
DROP VIEW IF EXISTS v_pipeline_health_metrics CASCADE;
CREATE VIEW v_pipeline_health_metrics 
WITH (security_invoker = true) AS
SELECT date_trunc('hour', created_at) AS hour, type, count(*) AS total_jobs,
    count(*) FILTER (WHERE status = 'completed') AS completed_jobs, count(*) FILTER (WHERE status = 'failed') AS failed_jobs,
    count(*) FILTER (WHERE status = 'queued') AS queued_jobs, count(*) FILTER (WHERE status = 'in_progress') AS in_progress_jobs,
    round(CASE WHEN count(*) > 0 THEN count(*) FILTER (WHERE status = 'completed')::numeric / count(*)::numeric * 100 ELSE 0 END, 2) AS success_rate,
    count(*) FILTER (WHERE status = 'completed' AND type = 'collect_web_activity' AND (EXISTS (SELECT 1 FROM agent_web_activity aw WHERE aw.agent_id = j.agent_id AND aw.created_at >= j.created_at))) AS completed_with_data,
    count(*) FILTER (WHERE status = 'completed' AND (type = ANY (ARRAY['collect_web_activity', 'software_inventory_collect', 'collect_antivirus_status'])) AND output IS NULL) AS silent_failures
FROM jobs j WHERE created_at >= (now() - '24:00:00'::interval) GROUP BY date_trunc('hour', created_at), type ORDER BY date_trunc('hour', created_at) DESC;

-- 34. Recreate v_action_center with security_invoker (CRITICAL)
DROP VIEW IF EXISTS v_action_center CASCADE;
CREATE VIEW v_action_center 
WITH (security_invoker = true) AS
SELECT pe.id AS item_id, 'playbook'::text AS source_type, pe.agent_id, a.agent_name, a.hostname,
    COALESCE(p.name, 'Playbook') AS title, COALESCE(pe.trigger_source, 'Acao pendente') AS description,
    COALESCE(p.severity, 'medium') AS severity, pe.risk_score, pe.trigger_context AS context,
    pe.triggered_at AS created_at, COALESCE(pe.trigger_source, 'manual') AS trigger_type, pe.playbook_id, pe.tenant_id,
    CASE WHEN p.severity = 'critical' THEN 100 WHEN p.severity = 'high' THEN 75 WHEN p.severity = 'medium' THEN 50 ELSE 25 END::numeric + COALESCE(pe.risk_score, 0::numeric) AS priority_score
FROM playbook_executions pe LEFT JOIN agents a ON pe.agent_id = a.id LEFT JOIN playbooks p ON pe.playbook_id = p.id WHERE pe.status = 'pending'
UNION ALL
SELECT sa.id AS item_id, 'alert'::text AS source_type, sa.agent_id, ag.agent_name, ag.hostname,
    sa.alert_type AS title, sa.message AS description, sa.severity, NULL::numeric AS risk_score, sa.details AS context,
    sa.created_at, sa.alert_type AS trigger_type, NULL::uuid AS playbook_id, sa.tenant_id,
    CASE WHEN sa.severity = 'critical' THEN 100 WHEN sa.severity = 'high' THEN 75 WHEN sa.severity = 'medium' THEN 50 ELSE 25 END AS priority_score
FROM system_alerts sa LEFT JOIN agents ag ON sa.agent_id = ag.id WHERE sa.acknowledged = false
UNION ALL
SELECT agt.id AS item_id, 'agent_offline'::text AS source_type, agt.id AS agent_id, agt.agent_name, agt.hostname,
    'Agente Offline' AS title, COALESCE(agt.offline_reason, 'Sem comunicacao') AS description,
    CASE WHEN agt.offline_detected_at < (now() - '24:00:00'::interval) THEN 'critical' WHEN agt.offline_detected_at < (now() - '04:00:00'::interval) THEN 'high' ELSE 'medium' END AS severity,
    NULL::numeric AS risk_score, jsonb_build_object('last_heartbeat', agt.last_heartbeat, 'offline_since', agt.offline_detected_at) AS context,
    COALESCE(agt.offline_detected_at, agt.last_heartbeat) AS created_at, 'agent_offline' AS trigger_type, NULL::uuid AS playbook_id, agt.tenant_id,
    CASE WHEN agt.offline_detected_at < (now() - '24:00:00'::interval) THEN 90 WHEN agt.offline_detected_at < (now() - '04:00:00'::interval) THEN 60 ELSE 30 END AS priority_score
FROM agents agt WHERE agt.status = 'offline'
UNION ALL
SELECT ins.id AS item_id, 'ai_insight'::text AS source_type, ins.agent_id, agt2.agent_name, agt2.hostname,
    ins.title, ins.description, ins.severity, ins.confidence_score AS risk_score,
    jsonb_build_object('insight_type', ins.insight_type, 'category', ins.category, 'recommended_actions', ins.recommended_actions, 'affected_resources', ins.affected_resources, 'evidence', ins.evidence, 'auto_action_mode', ins.auto_action_mode, 'auto_action_executed', ins.auto_action_executed) AS context,
    ins.created_at, ins.insight_type AS trigger_type, NULL::uuid AS playbook_id, ins.tenant_id,
    CASE WHEN ins.severity = 'critical' THEN 100 WHEN ins.severity = 'high' THEN 75 WHEN ins.severity = 'medium' THEN 50 ELSE 25 END + COALESCE((ins.confidence_score * 10)::integer, 0) AS priority_score
FROM ai_insights ins LEFT JOIN agents agt2 ON ins.agent_id = agt2.id WHERE ins.acknowledged = false AND ins.auto_action_executed = false;

-- Grant permissions
GRANT SELECT ON agents_health_view TO authenticated;
GRANT SELECT ON agents_safe TO authenticated;
GRANT SELECT ON audit_logs_safe TO authenticated;
GRANT SELECT ON enrollment_keys_safe TO authenticated;
GRANT SELECT ON v_agent_health_summary TO authenticated;
GRANT SELECT ON v_problematic_agents TO authenticated;
GRANT SELECT ON v_problematic_jobs TO authenticated;
GRANT SELECT ON v_stuck_jobs_report TO authenticated;
GRANT SELECT ON v_job_execution_health TO authenticated;
GRANT SELECT ON v_soc2_readiness TO authenticated;
GRANT SELECT ON v_system_operations_summary TO authenticated;
GRANT SELECT ON v_tenant_plan_status TO authenticated;
GRANT SELECT ON agent_installation_metrics TO authenticated;
GRANT SELECT ON agent_releases_public TO authenticated;
GRANT SELECT ON agent_system_metrics_unified TO authenticated;
GRANT SELECT ON agent_timeline_events TO authenticated;
GRANT SELECT ON hmac_signatures TO authenticated;
GRANT SELECT ON rate_limit_stats TO authenticated;
GRANT SELECT ON jobs_normalized TO authenticated;
GRANT SELECT ON job_integrity_violations TO authenticated;
GRANT SELECT ON installation_error_summary TO authenticated;
GRANT SELECT ON installation_health_status TO authenticated;
GRANT SELECT ON installation_metrics_summary TO authenticated;
GRANT SELECT ON v_agent_execution_health TO authenticated;
GRANT SELECT ON v_agent_lifecycle_state TO authenticated;
GRANT SELECT ON v_confidence_gap_trend TO authenticated;
GRANT SELECT ON v_edge_function_stats TO authenticated;
GRANT SELECT ON v_execution_chain_health TO authenticated;
GRANT SELECT ON v_integrity_score TO authenticated;
GRANT SELECT ON v_job_hourly_trends TO authenticated;
GRANT SELECT ON v_job_metrics_by_type TO authenticated;
GRANT SELECT ON v_jobs_status_corrected TO authenticated;
GRANT SELECT ON v_pipeline_health_metrics TO authenticated;
GRANT SELECT ON v_action_center TO authenticated;
