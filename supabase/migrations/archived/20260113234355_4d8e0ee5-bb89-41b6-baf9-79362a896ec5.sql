
-- ADR-025 Phase 4: Fix remaining critical views with CASCADE

-- Drop dependent views first
DROP VIEW IF EXISTS public.v_action_center CASCADE;
DROP VIEW IF EXISTS public.v_system_operations_summary CASCADE;
DROP VIEW IF EXISTS public.v_tenant_plan_status CASCADE;

-- 1. CRITICAL: active_agents - Was exposing hmac_secret without any filtering!
DROP VIEW IF EXISTS public.active_agents CASCADE;
CREATE VIEW public.active_agents
WITH (security_invoker = true)
AS
SELECT 
  id,
  agent_name,
  enrolled_at,
  last_heartbeat,
  status,
  -- REMOVED hmac_secret - this should only be accessed via admin-only hmac_agent_secrets view
  tenant_id,
  payload_hash,
  os_type,
  os_version,
  hostname,
  agent_version,
  display_name,
  force_update_version,
  force_update_reason,
  force_update_at,
  last_forced_update_applied,
  ed25519_supported,
  signature_mode,
  result_public_key,
  result_key_fingerprint,
  result_key_registered_at,
  agent_mode,
  safe_mode_reason,
  safe_mode_entered_at,
  last_block_sync_at,
  poll_interval_seconds,
  is_throttled,
  throttled_at,
  throttle_reason,
  is_isolated,
  isolated_at,
  isolation_reason,
  agent_version_code,
  force_update_override_safe_mode,
  force_update_override_safe_mode_expires_at,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  offline_reason,
  offline_detected_at,
  archived_at,
  archived_reason,
  requires_revalidation,
  revalidation_reason,
  revalidation_required_at
FROM agents
WHERE 
  archived_at IS NULL
  AND (
    tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- Recreate dependent views with security_invoker

-- v_tenant_plan_status
CREATE VIEW public.v_tenant_plan_status
WITH (security_invoker = true)
AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  COALESCE(tf.quota_limit, 100) AS max_agents,
  (SELECT count(*) FROM active_agents WHERE active_agents.tenant_id = t.id) AS current_agents,
  CASE
    WHEN (COALESCE(tf.quota_limit, 100) > 0) AND ((SELECT count(*) FROM active_agents WHERE active_agents.tenant_id = t.id) >= COALESCE(tf.quota_limit, 100)) THEN 'limit_reached'::text
    WHEN (COALESCE(tf.quota_limit, 100) > 0) AND ((SELECT count(*) FROM active_agents WHERE active_agents.tenant_id = t.id)::numeric >= (COALESCE(tf.quota_limit, 100)::numeric * 0.9)) THEN 'near_limit'::text
    ELSE 'ok'::text
  END AS agent_limit_status
FROM tenants t
LEFT JOIN tenant_features tf ON tf.tenant_id = t.id AND tf.feature_key = 'max_devices'
WHERE 
  t.id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- v_system_operations_summary
CREATE VIEW public.v_system_operations_summary
WITH (security_invoker = true)
AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  (SELECT count(*) FROM active_agents WHERE active_agents.tenant_id = t.id) AS total_agents,
  (SELECT count(*) FROM active_agents WHERE active_agents.tenant_id = t.id AND active_agents.last_heartbeat > (now() - '00:05:00'::interval)) AS online_agents,
  (SELECT count(*) FROM active_agents WHERE active_agents.tenant_id = t.id AND (active_agents.last_heartbeat IS NULL OR active_agents.last_heartbeat < (now() - '00:30:00'::interval))) AS offline_agents,
  (SELECT count(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.created_at > (now() - '24:00:00'::interval)) AS jobs_24h,
  (SELECT count(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.status = 'completed' AND jobs.created_at > (now() - '24:00:00'::interval)) AS jobs_completed_24h,
  (SELECT count(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.status = 'failed' AND jobs.created_at > (now() - '24:00:00'::interval)) AS jobs_failed_24h,
  (SELECT count(*) FROM system_alerts WHERE system_alerts.tenant_id = t.id AND system_alerts.acknowledged = false) AS open_alerts
FROM tenants t
WHERE 
  t.id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- v_action_center
CREATE VIEW public.v_action_center
WITH (security_invoker = true)
AS
SELECT 
  pe.id AS item_id,
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
  (CASE
    WHEN p.severity = 'critical' THEN 100
    WHEN p.severity = 'high' THEN 75
    WHEN p.severity = 'medium' THEN 50
    ELSE 25
  END::numeric + COALESCE(pe.risk_score, 0::numeric)) AS priority_score
FROM playbook_executions pe
LEFT JOIN active_agents a ON pe.agent_id = a.id
LEFT JOIN playbooks p ON pe.playbook_id = p.id
WHERE 
  pe.status = 'pending'
  AND (
    pe.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
UNION ALL
SELECT 
  sa.id AS item_id,
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
    WHEN sa.severity = 'critical' THEN 100
    WHEN sa.severity = 'high' THEN 75
    WHEN sa.severity = 'medium' THEN 50
    ELSE 25
  END AS priority_score
FROM system_alerts sa
LEFT JOIN active_agents ag ON sa.agent_id = ag.id
WHERE 
  sa.acknowledged = false
  AND (
    sa.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
UNION ALL
SELECT 
  agt.id AS item_id,
  'agent_offline'::text AS source_type,
  agt.id AS agent_id,
  agt.agent_name,
  agt.hostname,
  'Agente Offline'::text AS title,
  COALESCE(agt.offline_reason, 'Sem comunicacao'::text) AS description,
  CASE
    WHEN agt.offline_detected_at < (now() - '24:00:00'::interval) THEN 'critical'::text
    WHEN agt.offline_detected_at < (now() - '04:00:00'::interval) THEN 'high'::text
    ELSE 'medium'::text
  END AS severity,
  NULL::numeric AS risk_score,
  jsonb_build_object('last_heartbeat', agt.last_heartbeat, 'offline_since', agt.offline_detected_at) AS context,
  COALESCE(agt.offline_detected_at, agt.last_heartbeat) AS created_at,
  'agent_offline'::text AS trigger_type,
  NULL::uuid AS playbook_id,
  agt.tenant_id,
  CASE
    WHEN agt.offline_detected_at < (now() - '24:00:00'::interval) THEN 90
    WHEN agt.offline_detected_at < (now() - '04:00:00'::interval) THEN 60
    ELSE 30
  END AS priority_score
FROM active_agents agt
WHERE agt.status = 'offline'
UNION ALL
SELECT 
  ins.id AS item_id,
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
    WHEN ins.severity = 'critical' THEN 100
    WHEN ins.severity = 'high' THEN 75
    WHEN ins.severity = 'medium' THEN 50
    ELSE 25
  END + COALESCE((ins.confidence_score * 10::numeric)::integer, 0)) AS priority_score
FROM ai_insights ins
LEFT JOIN active_agents agt2 ON ins.agent_id = agt2.id
WHERE 
  ins.acknowledged = false 
  AND ins.auto_action_executed = false
  AND (
    ins.tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  );

-- 2. agents_public - Add security_invoker
DROP VIEW IF EXISTS public.agents_public;
CREATE VIEW public.agents_public
WITH (security_invoker = true)
AS
SELECT 
  id,
  agent_name,
  enrolled_at,
  last_heartbeat,
  status,
  tenant_id,
  os_type,
  os_version,
  hostname,
  agent_version,
  display_name,
  agent_mode,
  is_throttled,
  throttled_at,
  throttle_reason,
  is_isolated,
  isolated_at,
  isolation_reason,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  offline_reason,
  offline_detected_at,
  archived_at,
  archived_reason
FROM agents
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
  OR public.is_current_super_admin();

-- 3. dlq_risk_overview - Add security_invoker
DROP VIEW IF EXISTS public.dlq_risk_overview;
CREATE VIEW public.dlq_risk_overview
WITH (security_invoker = true)
AS
SELECT 
  risk_category,
  count(*) AS total_items,
  count(*) FILTER (WHERE status = 'pending') AS pending_items,
  max(created_at) AS newest_item,
  min(created_at) AS oldest_item,
  CASE
    WHEN risk_category IN ('critical', 'high') AND min(created_at) < (now() - '24:00:00'::interval) THEN true
    ELSE false
  END AS requires_attention
FROM failed_jobs_dlq
WHERE 
  tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid() AND user_roles.role IN ('admin', 'super_admin'))
  OR public.is_current_super_admin()
GROUP BY risk_category;

-- 4. installation_health_status - Add security_invoker and super_admin fallback
DROP VIEW IF EXISTS public.installation_health_status;
CREATE VIEW public.installation_health_status
WITH (security_invoker = true)
AS
SELECT 
  tenant_id,
  count(*) AS total_agents,
  count(*) FILTER (WHERE status = 'active' AND last_heartbeat >= (now() - '00:05:00'::interval)) AS active_agents,
  count(*) FILTER (WHERE status = 'pending') AS pending_agents,
  count(*) FILTER (WHERE status = 'active' AND (last_heartbeat IS NULL OR last_heartbeat < (now() - '00:30:00'::interval))) AS stuck_agents,
  CASE
    WHEN count(*) > 0 THEN round((count(*) FILTER (WHERE status = 'active')::numeric / count(*)::numeric) * 100::numeric, 1)
    ELSE 0::numeric
  END AS activation_rate_pct,
  'last_24h'::text AS window_interval
FROM agents a
WHERE 
  enrolled_at > (now() - '24:00:00'::interval) 
  AND (
    tenant_id IN (SELECT user_roles.tenant_id FROM user_roles WHERE user_roles.user_id = auth.uid())
    OR public.is_current_super_admin()
  )
GROUP BY tenant_id;

-- Grant permissions
GRANT SELECT ON public.active_agents TO authenticated;
GRANT SELECT ON public.agents_public TO authenticated;
GRANT SELECT ON public.dlq_risk_overview TO authenticated;
GRANT SELECT ON public.installation_health_status TO authenticated;
GRANT SELECT ON public.v_tenant_plan_status TO authenticated;
GRANT SELECT ON public.v_system_operations_summary TO authenticated;
GRANT SELECT ON public.v_action_center TO authenticated;
