-- ADR-026 Phase A: Batch 3 - Create remaining 12 views (FINAL)

-- 13. v_enforcement_compliance
CREATE VIEW public.v_enforcement_compliance WITH (security_invoker = on) AS
SELECT sp.tenant_id, sp.id AS policy_id, sp.name AS policy_name, sp.priority,
    sp.enabled, sp.is_active,
    count(pa.id) AS assigned_targets
FROM security_policies sp LEFT JOIN policy_assignments pa ON pa.policy_id = sp.id
WHERE sp.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY sp.tenant_id, sp.id, sp.name, sp.priority, sp.enabled, sp.is_active;

-- 14. v_execution_chain_health
CREATE VIEW public.v_execution_chain_health WITH (security_invoker = on) AS
SELECT ec.agent_id, ec.last_execution_hash, ec.last_execution_index, ec.updated_at,
    a.agent_name, a.tenant_id, a.status, now() - ec.updated_at AS time_since_last_execution
FROM agent_execution_chain ec JOIN agents a ON a.id = ec.agent_id
WHERE a.tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

-- 15. v_governance_stats
CREATE VIEW public.v_governance_stats WITH (security_invoker = on) AS
SELECT tenant_id, count(*) AS total_reports,
    count(*) FILTER (WHERE approved_at IS NOT NULL) AS approved,
    count(*) FILTER (WHERE approved_at IS NULL) AS pending,
    max(generated_at) AS last_report_at
FROM governance_reports WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id;

-- 16. v_job_hourly_trends
CREATE VIEW public.v_job_hourly_trends WITH (security_invoker = on) AS
SELECT tenant_id, date_trunc('hour', created_at) AS hour, count(*) AS total,
    count(*) FILTER (WHERE status = 'completed') AS completed,
    count(*) FILTER (WHERE status = 'failed') AS failed,
    round((count(*) FILTER (WHERE status = 'completed'))::numeric / NULLIF(count(*), 0)::numeric * 100, 1) AS success_rate_pct
FROM jobs WHERE created_at > now() - '24 hours'::interval
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
GROUP BY tenant_id, date_trunc('hour', created_at) ORDER BY date_trunc('hour', created_at) DESC;

-- 17. v_problematic_agents
CREATE VIEW public.v_problematic_agents WITH (security_invoker = on) AS
SELECT id, tenant_id, agent_name, display_name, hostname, status, agent_state, last_heartbeat,
    agent_version, is_isolated, isolation_reason,
    CASE WHEN is_isolated THEN 'isolated' WHEN agent_state = 'safe_mode' THEN 'safe_mode'
         WHEN last_heartbeat < now() - '1 hour'::interval THEN 'offline'
         WHEN last_heartbeat < now() - '15 minutes'::interval THEN 'degraded' ELSE 'unknown' END AS problem_type,
    GREATEST(last_heartbeat, isolated_at, agent_state_changed_at) AS problem_since
FROM agents WHERE archived_at IS NULL
  AND (is_isolated OR agent_state = 'safe_mode' OR last_heartbeat < now() - '15 minutes'::interval)
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 18. v_problematic_jobs
CREATE VIEW public.v_problematic_jobs WITH (security_invoker = on) AS
SELECT id, tenant_id, agent_id, agent_name, type, status, created_at, delivered_at, error_message,
    CASE WHEN status = 'queued' AND created_at < now() - '1 hour'::interval THEN 'stuck_queued'
         WHEN status = 'delivered' AND delivered_at < now() - '30 minutes'::interval THEN 'stuck_delivered'
         WHEN status = 'failed' AND error_message IS NOT NULL THEN 'failed_with_error'
         WHEN status = 'failed' THEN 'failed_silent' ELSE 'unknown' END AS problem_type,
    EXTRACT(epoch FROM (now() - COALESCE(delivered_at, created_at))) / 60 AS minutes_stuck
FROM jobs WHERE ((status = 'queued' AND created_at < now() - '1 hour'::interval)
    OR (status = 'delivered' AND delivered_at < now() - '30 minutes'::interval) OR status = 'failed')
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- 19. v_rbac_metrics
CREATE VIEW public.v_rbac_metrics WITH (security_invoker = on) AS
SELECT tenant_id, count(DISTINCT user_id) AS total_users,
    count(DISTINCT user_id) FILTER (WHERE role::text = 'admin') AS admin_count,
    count(DISTINCT user_id) FILTER (WHERE role::text = 'analyst') AS analyst_count,
    count(DISTINCT user_id) FILTER (WHERE role::text = 'viewer') AS viewer_count
FROM user_roles WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id;

-- 20. v_soc2_readiness
CREATE VIEW public.v_soc2_readiness WITH (security_invoker = on) AS
SELECT tenant_id, control_code, control_name, description, status, evidence_type,
    evidence_ref, gap_notes, remediation_plan, owner, due_date, verified_at, verified_by
FROM soc2_controls WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin();

-- 21. v_stuck_jobs_report
CREATE VIEW public.v_stuck_jobs_report WITH (security_invoker = on) AS
SELECT id, agent_name, type, status, tenant_id, created_at, delivered_at,
    EXTRACT(epoch FROM (now() - COALESCE(delivered_at, created_at))) / 60 AS minutes_stuck,
    CASE WHEN status = 'delivered' AND delivered_at < now() - '30 minutes'::interval THEN 'stuck_delivered'
         WHEN status = 'queued' AND created_at < now() - '2 hours'::interval THEN 'stuck_queued'
         WHEN status = 'pending' AND created_at < now() - '1 hour'::interval THEN 'stuck_pending'
         ELSE 'normal' END AS stuck_reason
FROM jobs WHERE ((status = 'delivered' AND delivered_at < now() - '30 minutes'::interval)
    OR (status = 'queued' AND created_at < now() - '2 hours'::interval)
    OR (status = 'pending' AND created_at < now() - '1 hour'::interval))
  AND (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin())
ORDER BY minutes_stuck DESC;

-- 22. v_system_operations_summary
CREATE VIEW public.v_system_operations_summary WITH (security_invoker = on) AS
SELECT t.id AS tenant_id, t.name AS tenant_name,
    (SELECT count(*) FROM agents a WHERE a.tenant_id = t.id AND a.archived_at IS NULL) AS total_agents,
    (SELECT count(*) FROM agents a WHERE a.tenant_id = t.id AND a.status = 'active' AND a.last_heartbeat > now() - '15 minutes'::interval) AS active_agents,
    (SELECT count(*) FROM jobs j WHERE j.tenant_id = t.id AND j.created_at > now() - '24 hours'::interval) AS jobs_24h,
    (SELECT count(*) FROM failed_jobs_dlq d WHERE d.tenant_id = t.id AND d.status = 'pending') AS pending_dlq
FROM tenants t WHERE t.id = public.get_active_tenant_id() OR public.is_current_super_admin();

-- 23. v_task_stats
CREATE VIEW public.v_task_stats WITH (security_invoker = on) AS
SELECT tenant_id, count(*) AS total_tasks,
    count(*) FILTER (WHERE status = 'pending') AS pending,
    count(*) FILTER (WHERE status = 'in_progress') AS in_progress,
    count(*) FILTER (WHERE status = 'completed') AS completed,
    count(*) FILTER (WHERE status = 'failed') AS failed
FROM tasks WHERE tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin()
GROUP BY tenant_id;

-- 24. v_tenant_plan_status (FIXED: uses actual columns from tenants and tenant_subscriptions)
CREATE VIEW public.v_tenant_plan_status WITH (security_invoker = on) AS
SELECT t.id AS tenant_id, t.name AS tenant_name, ts.plan_id, ts.status AS subscription_status,
    ts.device_quantity, ts.addon_devices, ts.trial_end, ts.current_period_end, t.created_at,
    (SELECT count(*) FROM agents a WHERE a.tenant_id = t.id AND a.archived_at IS NULL) AS current_agents,
    (SELECT count(DISTINCT user_id) FROM user_roles ur WHERE ur.tenant_id = t.id) AS current_users
FROM tenants t LEFT JOIN tenant_subscriptions ts ON ts.tenant_id = t.id AND ts.status = 'active'
WHERE t.id = public.get_active_tenant_id() OR public.is_current_super_admin();