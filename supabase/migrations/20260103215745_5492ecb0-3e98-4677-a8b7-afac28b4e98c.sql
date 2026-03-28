-- =====================================================
-- Migration: Convert all views to SECURITY INVOKER
-- This ensures RLS policies are properly applied
-- =====================================================

-- DROP views in dependency order (dependents first)
DROP VIEW IF EXISTS public.governance_health_metrics CASCADE;
DROP VIEW IF EXISTS public.v_action_center CASCADE;
DROP VIEW IF EXISTS public.v_agent_archive_reason_tree CASCADE;
DROP VIEW IF EXISTS public.v_agent_execution_health CASCADE;
DROP VIEW IF EXISTS public.v_agent_health_summary CASCADE;
DROP VIEW IF EXISTS public.v_agent_lifecycle_state CASCADE;
DROP VIEW IF EXISTS public.v_audit_moving_average CASCADE;
DROP VIEW IF EXISTS public.v_dlq_pending_attention CASCADE;
DROP VIEW IF EXISTS public.v_enforcement_compliance CASCADE;
DROP VIEW IF EXISTS public.v_execution_chain_health CASCADE;
DROP VIEW IF EXISTS public.v_problematic_agents CASCADE;
DROP VIEW IF EXISTS public.v_rbac_metrics CASCADE;
DROP VIEW IF EXISTS public.v_system_operations_summary CASCADE;
DROP VIEW IF EXISTS public.v_tenant_isolation_metrics CASCADE;
DROP VIEW IF EXISTS public.v_tenant_plan_status CASCADE;
DROP VIEW IF EXISTS public.hmac_signatures CASCADE;
DROP VIEW IF EXISTS public.agents_health_view CASCADE;
DROP VIEW IF EXISTS public.agents_safe CASCADE;
DROP VIEW IF EXISTS public.active_agents CASCADE;

-- =====================================================
-- RECREATE VIEWS WITH security_invoker=on
-- =====================================================

-- 1. active_agents (base view)
CREATE VIEW public.active_agents WITH (security_invoker=on) AS
SELECT agents.id,
    agents.tenant_id,
    agents.agent_name,
    agents.display_name,
    agents.hostname,
    agents.status,
    agents.agent_state,
    agents.agent_state_reason,
    agents.agent_state_changed_at,
    agents.last_heartbeat,
    agents.agent_version,
    agents.os_type,
    agents.os_version,
    agents.enrolled_at,
    agents.hmac_secret,
    agents.is_isolated,
    agents.isolated_at,
    agents.isolation_reason,
    agents.offline_detected_at,
    agents.offline_reason
   FROM agents
  WHERE (agents.archived_at IS NULL);

-- 2. agents_safe
CREATE VIEW public.agents_safe WITH (security_invoker=on) AS
SELECT a.id,
    a.tenant_id,
    a.agent_name,
    a.display_name,
    a.hostname,
    a.status,
    a.agent_state,
    a.agent_state_reason,
    a.agent_state_changed_at,
    a.last_heartbeat,
    a.agent_version,
    a.os_type,
    a.os_version,
    a.enrolled_at,
    a.is_isolated,
    a.isolated_at,
    a.isolation_reason,
    a.archived_at,
    a.archived_reason
   FROM agents a;

-- 3. agents_health_view
CREATE VIEW public.agents_health_view WITH (security_invoker=on) AS
SELECT a.id,
    a.tenant_id,
    a.agent_name,
    a.display_name,
    a.hostname,
    a.status,
    a.agent_state,
    a.last_heartbeat,
    a.agent_version,
    a.os_type,
    a.os_version,
    a.enrolled_at,
    a.is_isolated,
    a.isolation_reason,
    m.cpu_usage_percent,
    m.memory_usage_percent,
    m.disk_usage_percent,
    m.uptime_seconds,
    m.collected_at AS metrics_collected_at,
        CASE
            WHEN (a.last_heartbeat IS NULL) THEN 'unknown'::text
            WHEN (a.last_heartbeat > (now() - '00:05:00'::interval)) THEN 'healthy'::text
            WHEN (a.last_heartbeat > (now() - '00:15:00'::interval)) THEN 'warning'::text
            ELSE 'critical'::text
        END AS health_status
   FROM (agents a
     LEFT JOIN LATERAL ( SELECT agent_system_metrics.cpu_usage_percent,
            agent_system_metrics.memory_usage_percent,
            agent_system_metrics.disk_usage_percent,
            agent_system_metrics.uptime_seconds,
            agent_system_metrics.collected_at
           FROM agent_system_metrics
          WHERE (agent_system_metrics.agent_id = a.id)
          ORDER BY agent_system_metrics.collected_at DESC
         LIMIT 1) m ON (true))
  WHERE (a.archived_at IS NULL);

-- 4. hmac_signatures
CREATE VIEW public.hmac_signatures WITH (security_invoker=on) AS
SELECT a.id AS agent_id,
    a.agent_name,
    a.hmac_secret,
    a.tenant_id
   FROM agents a;

-- 5. v_problematic_agents
CREATE VIEW public.v_problematic_agents WITH (security_invoker=on) AS
SELECT a.id,
    a.tenant_id,
    a.agent_name,
    a.display_name,
    a.hostname,
    a.status,
    a.agent_state,
    a.last_heartbeat,
    a.agent_version,
    a.is_isolated,
    a.isolation_reason,
        CASE
            WHEN (a.is_isolated = true) THEN 'isolated'::text
            WHEN ((a.agent_state)::text = 'safe_mode'::text) THEN 'safe_mode'::text
            WHEN (a.last_heartbeat < (now() - '01:00:00'::interval)) THEN 'offline'::text
            WHEN (a.last_heartbeat < (now() - '00:15:00'::interval)) THEN 'degraded'::text
            ELSE 'unknown'::text
        END AS problem_type,
    GREATEST(a.last_heartbeat, a.isolated_at, a.agent_state_changed_at) AS problem_since
   FROM agents a
  WHERE ((a.archived_at IS NULL) AND ((a.is_isolated = true) OR ((a.agent_state)::text = 'safe_mode'::text) OR (a.last_heartbeat < (now() - '00:15:00'::interval))));

-- 6. v_agent_lifecycle_state
CREATE VIEW public.v_agent_lifecycle_state WITH (security_invoker=on) AS
SELECT a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    a.agent_state,
    a.agent_state_reason,
    a.agent_state_changed_at,
    a.is_isolated,
    a.isolation_reason,
    a.isolated_at,
    a.requires_revalidation,
    a.revalidation_reason,
    a.revalidation_required_at,
    a.safe_mode_entered_at,
    a.safe_mode_reason,
    a.force_update_version,
    a.force_update_reason,
    a.force_update_at,
    a.last_forced_update_applied,
        CASE
            WHEN (a.is_isolated = true) THEN 'isolated'::text
            WHEN ((a.agent_state)::text = 'safe_mode'::text) THEN 'safe_mode'::text
            WHEN (a.requires_revalidation = true) THEN 'pending_revalidation'::text
            WHEN (a.force_update_version IS NOT NULL) THEN 'pending_update'::text
            WHEN ((a.agent_state)::text = 'active'::text) THEN 'healthy'::text
            ELSE 'unknown'::text
        END AS lifecycle_status
   FROM agents a
  WHERE (a.archived_at IS NULL);

-- 7. v_agent_health_summary
CREATE VIEW public.v_agent_health_summary WITH (security_invoker=on) AS
SELECT a.id,
    a.tenant_id,
    a.agent_name,
    a.display_name,
    a.hostname,
    a.status,
    a.agent_state,
    a.last_heartbeat,
    a.agent_version,
    a.is_isolated,
    m.cpu_usage_percent AS latest_cpu,
    m.memory_usage_percent AS latest_memory,
    m.disk_usage_percent AS latest_disk,
    m.uptime_seconds AS latest_uptime,
        CASE
            WHEN (a.is_isolated = true) THEN 'isolated'::text
            WHEN ((a.agent_state)::text = 'safe_mode'::text) THEN 'critical'::text
            WHEN (a.last_heartbeat < (now() - '00:15:00'::interval)) THEN 'critical'::text
            WHEN (a.last_heartbeat < (now() - '00:05:00'::interval)) THEN 'warning'::text
            WHEN ((COALESCE(m.cpu_usage_percent, (0)::numeric) > (90)::numeric) OR (COALESCE(m.memory_usage_percent, (0)::numeric) > (90)::numeric) OR (COALESCE(m.disk_usage_percent, (0)::numeric) > (90)::numeric)) THEN 'warning'::text
            ELSE 'healthy'::text
        END AS health_status,
    ( SELECT count(*) AS count
           FROM agent_rollback_events r
          WHERE ((r.agent_id = a.id) AND (r.created_at > (now() - '24:00:00'::interval)))) AS rollbacks_24h,
    ( SELECT count(*) AS count
           FROM agent_safe_mode_events s
          WHERE ((s.agent_id = a.id) AND (s.resolved_at IS NULL))) AS active_safe_mode_events
   FROM (agents a
     LEFT JOIN LATERAL ( SELECT agent_system_metrics.cpu_usage_percent,
            agent_system_metrics.memory_usage_percent,
            agent_system_metrics.disk_usage_percent,
            agent_system_metrics.uptime_seconds
           FROM agent_system_metrics
          WHERE (agent_system_metrics.agent_id = a.id)
          ORDER BY agent_system_metrics.collected_at DESC
         LIMIT 1) m ON (true))
  WHERE (a.archived_at IS NULL);

-- 8. v_agent_execution_health
CREATE VIEW public.v_agent_execution_health WITH (security_invoker=on) AS
SELECT a.id AS agent_id,
    a.tenant_id,
    a.agent_name,
    c.last_execution_index,
    c.last_execution_hash,
    c.updated_at AS chain_updated_at,
        CASE
            WHEN (c.agent_id IS NULL) THEN 'no_chain'::text
            WHEN (c.updated_at < (now() - '01:00:00'::interval)) THEN 'stale'::text
            WHEN (c.updated_at < (now() - '00:15:00'::interval)) THEN 'delayed'::text
            ELSE 'healthy'::text
        END AS chain_health
   FROM (agents a
     LEFT JOIN agent_execution_chain c ON ((c.agent_id = a.id)))
  WHERE (a.archived_at IS NULL);

-- 9. v_execution_chain_health
CREATE VIEW public.v_execution_chain_health WITH (security_invoker=on) AS
SELECT c.agent_id,
    a.tenant_id,
    a.agent_name,
    c.last_execution_index,
    c.last_execution_hash,
    c.updated_at,
        CASE
            WHEN (c.updated_at > (now() - '00:05:00'::interval)) THEN 'healthy'::text
            WHEN (c.updated_at > (now() - '00:15:00'::interval)) THEN 'warning'::text
            ELSE 'critical'::text
        END AS chain_status,
    EXTRACT(epoch FROM (now() - c.updated_at)) AS seconds_since_update
   FROM (agent_execution_chain c
     JOIN agents a ON ((a.id = c.agent_id)))
  WHERE (a.archived_at IS NULL);

-- 10. v_agent_archive_reason_tree
CREATE VIEW public.v_agent_archive_reason_tree WITH (security_invoker=on) AS
SELECT e.id AS event_id,
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
   FROM (agent_archive_events e
     JOIN agents a ON ((a.id = e.agent_id)))
  WHERE (a.archived_at IS NOT NULL)
  ORDER BY e.created_at DESC;

-- 11. v_dlq_pending_attention (uses failed_jobs_dlq)
CREATE VIEW public.v_dlq_pending_attention WITH (security_invoker=on) AS
SELECT id,
    original_job_id,
    tenant_id,
    agent_id,
    agent_name,
    job_type,
    payload,
    error_message,
    error_count,
    first_failure_at,
    last_failure_at,
    retry_count,
    max_retries,
    next_retry_at,
    status,
    resolution_notes,
    resolved_at,
    resolved_by,
    metadata,
    created_at,
    failure_class,
    review_notes,
    risk_category,
    review_required,
    flagged_suspicious,
    auto_flagged_reason,
    payload_hash,
    payload_schema,
    payload_excerpt,
    classification,
    decision_event_id,
    resolution_source,
    (EXTRACT(epoch FROM (now() - created_at)) / (3600)::numeric) AS hours_pending
   FROM failed_jobs_dlq d
  WHERE ((status = 'pending'::text) AND (created_at < (now() - '01:00:00'::interval)) AND (review_required = true));

-- 12. v_audit_moving_average
CREATE VIEW public.v_audit_moving_average WITH (security_invoker=on) AS
SELECT s.tenant_id,
    s.created_at,
    s.overall_score,
    avg(s.overall_score) OVER (PARTITION BY s.tenant_id ORDER BY s.created_at ROWS BETWEEN 4 PRECEDING AND CURRENT ROW) AS moving_avg_5,
    s.overall_score - lag(s.overall_score) OVER (PARTITION BY s.tenant_id ORDER BY s.created_at) AS score_delta
   FROM system_audits s
  ORDER BY s.tenant_id, s.created_at;

-- 13. v_tenant_plan_status (uses tenant_features for quota)
CREATE VIEW public.v_tenant_plan_status WITH (security_invoker=on) AS
SELECT t.id AS tenant_id,
    t.name AS tenant_name,
    COALESCE(tf.quota_limit, 100) AS max_agents,
    ( SELECT count(*) AS count
           FROM active_agents
          WHERE (active_agents.tenant_id = t.id)) AS current_agents,
        CASE
            WHEN ((COALESCE(tf.quota_limit, 100) > 0) AND (( SELECT count(*) AS count
               FROM active_agents
              WHERE (active_agents.tenant_id = t.id)) >= COALESCE(tf.quota_limit, 100))) THEN 'limit_reached'::text
            WHEN ((COALESCE(tf.quota_limit, 100) > 0) AND ((( SELECT count(*) AS count
               FROM active_agents
              WHERE (active_agents.tenant_id = t.id)))::numeric >= ((COALESCE(tf.quota_limit, 100))::numeric * 0.9))) THEN 'near_limit'::text
            ELSE 'ok'::text
        END AS agent_limit_status
   FROM (tenants t
     LEFT JOIN tenant_features tf ON (((tf.tenant_id = t.id) AND (tf.feature_key = 'max_devices'::text))));

-- 14. v_system_operations_summary (uses jobs, system_alerts, active_agents)
CREATE VIEW public.v_system_operations_summary WITH (security_invoker=on) AS
SELECT t.id AS tenant_id,
    t.name AS tenant_name,
    ( SELECT count(*) AS count
           FROM active_agents
          WHERE (active_agents.tenant_id = t.id)) AS total_agents,
    ( SELECT count(*) AS count
           FROM active_agents
          WHERE ((active_agents.tenant_id = t.id) AND (active_agents.last_heartbeat > (now() - '00:05:00'::interval)))) AS online_agents,
    ( SELECT count(*) AS count
           FROM active_agents
          WHERE ((active_agents.tenant_id = t.id) AND ((active_agents.last_heartbeat IS NULL) OR (active_agents.last_heartbeat < (now() - '00:30:00'::interval))))) AS offline_agents,
    ( SELECT count(*) AS count
           FROM jobs
          WHERE ((jobs.tenant_id = t.id) AND (jobs.created_at > (now() - '24:00:00'::interval)))) AS jobs_24h,
    ( SELECT count(*) AS count
           FROM jobs
          WHERE ((jobs.tenant_id = t.id) AND (jobs.status = 'completed'::text) AND (jobs.created_at > (now() - '24:00:00'::interval)))) AS jobs_completed_24h,
    ( SELECT count(*) AS count
           FROM jobs
          WHERE ((jobs.tenant_id = t.id) AND (jobs.status = 'failed'::text) AND (jobs.created_at > (now() - '24:00:00'::interval)))) AS jobs_failed_24h,
    ( SELECT count(*) AS count
           FROM system_alerts
          WHERE ((system_alerts.tenant_id = t.id) AND (system_alerts.acknowledged = false))) AS open_alerts
   FROM tenants t;

-- 15. v_enforcement_compliance
CREATE VIEW public.v_enforcement_compliance WITH (security_invoker=on) AS
SELECT sp.tenant_id,
    count(DISTINCT sp.id) AS total_policies,
    count(DISTINCT sp.id) FILTER (WHERE (sp.is_active = true)) AS active_policies,
    count(DISTINCT agp.id) AS policy_assignments,
    count(DISTINCT ag.id) AS groups_with_policies
   FROM ((security_policies sp
     LEFT JOIN agent_group_policies agp ON ((agp.policy_id = sp.id)))
     LEFT JOIN agent_groups ag ON ((ag.id = agp.group_id)))
  GROUP BY sp.tenant_id;

-- 16. v_rbac_metrics
CREATE VIEW public.v_rbac_metrics WITH (security_invoker=on) AS
SELECT ur.tenant_id,
    count(DISTINCT ur.user_id) AS total_users,
    count(DISTINCT ur.user_id) FILTER (WHERE ((ur.role)::text = 'admin'::text)) AS admin_count,
    count(DISTINCT ur.user_id) FILTER (WHERE ((ur.role)::text = 'analyst'::text)) AS analyst_count,
    count(DISTINCT ur.user_id) FILTER (WHERE ((ur.role)::text = 'viewer'::text)) AS viewer_count
   FROM user_roles ur
  GROUP BY ur.tenant_id;

-- 17. v_tenant_isolation_metrics
CREATE VIEW public.v_tenant_isolation_metrics WITH (security_invoker=on) AS
SELECT a.tenant_id,
    count(*) AS total_agents,
    count(*) FILTER (WHERE (a.is_isolated = true)) AS isolated_count,
    count(*) FILTER (WHERE ((a.agent_state)::text = 'safe_mode'::text)) AS safe_mode_count,
    count(*) FILTER (WHERE (a.requires_revalidation = true)) AS pending_revalidation
   FROM agents a
  WHERE (a.archived_at IS NULL)
  GROUP BY a.tenant_id;

-- 18. v_action_center (uses playbook_executions, system_alerts, active_agents, ai_insights)
CREATE VIEW public.v_action_center WITH (security_invoker=on) AS
SELECT pe.id AS item_id,
    'playbook'::text AS source_type,
    pe.agent_id,
    a.agent_name,
    a.hostname,
    COALESCE(p.name, 'Playbook'::text) AS title,
    COALESCE(pe.trigger_source, 'Acao pendente'::text) AS description,
    COALESCE(p.severity, 'medium'::text) AS severity,
    pe.risk_score,
    pe.trigger_context AS context,
    pe.triggered_at AS created_at,
    COALESCE(pe.trigger_source, 'manual'::text) AS trigger_type,
    pe.playbook_id,
    pe.tenant_id,
    ((CASE
        WHEN (p.severity = 'critical'::text) THEN 100
        WHEN (p.severity = 'high'::text) THEN 75
        WHEN (p.severity = 'medium'::text) THEN 50
        ELSE 25
    END)::numeric + COALESCE(pe.risk_score, (0)::numeric)) AS priority_score
   FROM ((playbook_executions pe
     LEFT JOIN active_agents a ON ((pe.agent_id = a.id)))
     LEFT JOIN playbooks p ON ((pe.playbook_id = p.id)))
  WHERE (pe.status = 'pending'::text)
UNION ALL
SELECT sa.id AS item_id,
    'alert'::text AS source_type,
    sa.agent_id,
    ag.agent_name,
    ag.hostname,
    sa.alert_type AS title,
    sa.message AS description,
    sa.severity,
    NULL::numeric AS risk_score,
    sa.details AS context,
    sa.created_at,
    sa.alert_type AS trigger_type,
    NULL::uuid AS playbook_id,
    sa.tenant_id,
    CASE
        WHEN (sa.severity = 'critical'::text) THEN 100
        WHEN (sa.severity = 'high'::text) THEN 75
        WHEN (sa.severity = 'medium'::text) THEN 50
        ELSE 25
    END AS priority_score
   FROM (system_alerts sa
     LEFT JOIN active_agents ag ON ((sa.agent_id = ag.id)))
  WHERE (sa.acknowledged = false)
UNION ALL
SELECT agt.id AS item_id,
    'agent_offline'::text AS source_type,
    agt.id AS agent_id,
    agt.agent_name,
    agt.hostname,
    'Agente Offline'::text AS title,
    COALESCE(agt.offline_reason, 'Sem comunicacao'::text) AS description,
    CASE
        WHEN (agt.offline_detected_at < (now() - '24:00:00'::interval)) THEN 'critical'::text
        WHEN (agt.offline_detected_at < (now() - '04:00:00'::interval)) THEN 'high'::text
        ELSE 'medium'::text
    END AS severity,
    NULL::numeric AS risk_score,
    jsonb_build_object('last_heartbeat', agt.last_heartbeat, 'offline_since', agt.offline_detected_at) AS context,
    COALESCE(agt.offline_detected_at, agt.last_heartbeat) AS created_at,
    'agent_offline'::text AS trigger_type,
    NULL::uuid AS playbook_id,
    agt.tenant_id,
    CASE
        WHEN (agt.offline_detected_at < (now() - '24:00:00'::interval)) THEN 90
        WHEN (agt.offline_detected_at < (now() - '04:00:00'::interval)) THEN 60
        ELSE 30
    END AS priority_score
   FROM active_agents agt
  WHERE (agt.status = 'offline'::text)
UNION ALL
SELECT ins.id AS item_id,
    'ai_insight'::text AS source_type,
    ins.agent_id,
    agt2.agent_name,
    agt2.hostname,
    ins.title,
    ins.description,
    ins.severity,
    ins.confidence_score AS risk_score,
    jsonb_build_object('insight_type', ins.insight_type, 'category', ins.category, 'recommended_actions', ins.recommended_actions, 'affected_resources', ins.affected_resources, 'evidence', ins.evidence, 'auto_action_mode', ins.auto_action_mode, 'auto_action_executed', ins.auto_action_executed) AS context,
    ins.created_at,
    ins.insight_type AS trigger_type,
    NULL::uuid AS playbook_id,
    ins.tenant_id,
    (CASE
        WHEN (ins.severity = 'critical'::text) THEN 100
        WHEN (ins.severity = 'high'::text) THEN 75
        WHEN (ins.severity = 'medium'::text) THEN 50
        ELSE 25
    END + COALESCE(((ins.confidence_score * (10)::numeric))::integer, 0)) AS priority_score
   FROM (ai_insights ins
     LEFT JOIN active_agents agt2 ON ((ins.agent_id = agt2.id)))
  WHERE ((ins.acknowledged = false) AND (ins.auto_action_executed = false));

-- 19. governance_health_metrics
CREATE VIEW public.governance_health_metrics WITH (security_invoker=on) AS
SELECT t.id AS tenant_id,
    t.name AS tenant_name,
    COALESCE(e.active_policies, (0)::bigint) AS active_policies,
    COALESCE(e.policy_assignments, (0)::bigint) AS policy_assignments,
    COALESCE(r.total_users, (0)::bigint) AS total_users,
    COALESCE(r.admin_count, (0)::bigint) AS admin_count,
    COALESCE(i.isolated_count, (0)::bigint) AS isolated_agents,
    COALESCE(i.safe_mode_count, (0)::bigint) AS safe_mode_agents,
    COALESCE(i.pending_revalidation, (0)::bigint) AS pending_revalidation,
        CASE
            WHEN ((COALESCE(i.isolated_count, (0)::bigint) > 0) OR (COALESCE(i.safe_mode_count, (0)::bigint) > 0)) THEN 'critical'::text
            WHEN (COALESCE(i.pending_revalidation, (0)::bigint) > 0) THEN 'warning'::text
            WHEN (COALESCE(e.active_policies, (0)::bigint) = 0) THEN 'warning'::text
            ELSE 'healthy'::text
        END AS governance_status
   FROM (((tenants t
     LEFT JOIN v_enforcement_compliance e ON ((e.tenant_id = t.id)))
     LEFT JOIN v_rbac_metrics r ON ((r.tenant_id = t.id)))
     LEFT JOIN v_tenant_isolation_metrics i ON ((i.tenant_id = t.id)));

-- =====================================================
-- GRANT permissions to roles
-- =====================================================
GRANT SELECT ON public.active_agents TO anon, authenticated;
GRANT SELECT ON public.agents_safe TO anon, authenticated;
GRANT SELECT ON public.agents_health_view TO anon, authenticated;
GRANT SELECT ON public.hmac_signatures TO authenticated;
GRANT SELECT ON public.v_problematic_agents TO anon, authenticated;
GRANT SELECT ON public.v_agent_lifecycle_state TO anon, authenticated;
GRANT SELECT ON public.v_agent_health_summary TO anon, authenticated;
GRANT SELECT ON public.v_agent_execution_health TO anon, authenticated;
GRANT SELECT ON public.v_execution_chain_health TO anon, authenticated;
GRANT SELECT ON public.v_agent_archive_reason_tree TO anon, authenticated;
GRANT SELECT ON public.v_dlq_pending_attention TO anon, authenticated;
GRANT SELECT ON public.v_audit_moving_average TO anon, authenticated;
GRANT SELECT ON public.v_tenant_plan_status TO anon, authenticated;
GRANT SELECT ON public.v_system_operations_summary TO anon, authenticated;
GRANT SELECT ON public.v_enforcement_compliance TO anon, authenticated;
GRANT SELECT ON public.v_rbac_metrics TO anon, authenticated;
GRANT SELECT ON public.v_tenant_isolation_metrics TO anon, authenticated;
GRANT SELECT ON public.v_action_center TO anon, authenticated;
GRANT SELECT ON public.governance_health_metrics TO anon, authenticated;