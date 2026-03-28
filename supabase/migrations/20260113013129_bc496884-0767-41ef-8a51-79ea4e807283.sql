-- =====================================================
-- FASE 2: Corrigir RLS da tabela agent_releases
-- =====================================================

-- Remover politica problematica e recriar
DROP POLICY IF EXISTS "agent_releases_select_active" ON agent_releases;

CREATE POLICY "agent_releases_select_authenticated"
  ON agent_releases FOR SELECT
  TO authenticated
  USING (
    is_active = true 
    OR is_current_super_admin()
  );

-- =====================================================
-- FASE 3: Corrigir 8 Views Publicas com autenticacao
-- =====================================================

-- 1. Recriar agents_safe com filtro de tenant
DROP VIEW IF EXISTS agents_safe CASCADE;
CREATE VIEW agents_safe 
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  agent_name,
  display_name,
  hostname,
  status,
  agent_state,
  agent_state_reason,
  agent_state_changed_at,
  last_heartbeat,
  agent_version,
  os_type,
  os_version,
  enrolled_at,
  is_isolated,
  isolated_at,
  isolation_reason,
  archived_at,
  archived_reason
FROM agents a
WHERE tenant_id IN (
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
)
OR is_current_super_admin();

-- 2. Recriar agents_public com filtro de tenant E sem campos sensiveis
DROP VIEW IF EXISTS agents_public CASCADE;
CREATE VIEW agents_public 
WITH (security_invoker = on) AS
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
WHERE tenant_id IN (
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
)
OR is_current_super_admin();

-- 3. Recriar agents_health_view com filtro de tenant
DROP VIEW IF EXISTS agents_health_view CASCADE;
CREATE VIEW agents_health_view 
WITH (security_invoker = on) AS
SELECT 
  a.id,
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
    WHEN a.last_heartbeat IS NULL THEN 'unknown'
    WHEN a.last_heartbeat > now() - interval '5 minutes' THEN 'healthy'
    WHEN a.last_heartbeat > now() - interval '15 minutes' THEN 'warning'
    ELSE 'critical'
  END AS health_status
FROM agents a
LEFT JOIN LATERAL (
  SELECT cpu_usage_percent, memory_usage_percent, disk_usage_percent, 
         uptime_seconds, collected_at
  FROM agent_system_metrics
  WHERE agent_id = a.id
  ORDER BY collected_at DESC
  LIMIT 1
) m ON true
WHERE a.archived_at IS NULL
AND (
  a.tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
);

-- 4. Recriar invites_safe com filtro de tenant
DROP VIEW IF EXISTS invites_safe CASCADE;
CREATE VIEW invites_safe 
WITH (security_invoker = on) AS
SELECT 
  id,
  email,
  role,
  tenant_id,
  invited_by,
  status,
  created_at,
  expires_at,
  accepted_at
FROM invites
WHERE tenant_id IN (
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
)
OR is_current_super_admin();

-- 5. Recriar dlq_risk_overview com verificacao de admin
DROP VIEW IF EXISTS dlq_risk_overview CASCADE;
CREATE VIEW dlq_risk_overview 
WITH (security_invoker = on) AS
SELECT 
  risk_category,
  count(*) AS total_items,
  count(*) FILTER (WHERE status = 'pending') AS pending_items,
  max(created_at) AS newest_item,
  min(created_at) AS oldest_item,
  CASE
    WHEN risk_category IN ('critical', 'high') 
         AND min(created_at) < now() - interval '24 hours' 
    THEN true
    ELSE false
  END AS requires_attention
FROM failed_jobs_dlq
WHERE EXISTS (
  SELECT 1 FROM user_roles 
  WHERE user_id = auth.uid() 
  AND role IN ('admin', 'super_admin')
)
OR is_current_super_admin()
GROUP BY risk_category;

-- 6. Recriar governance_health_metrics com filtro de tenant
DROP VIEW IF EXISTS governance_health_metrics CASCADE;
CREATE VIEW governance_health_metrics 
WITH (security_invoker = on) AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  COALESCE(e.active_policies, 0) AS active_policies,
  COALESCE(e.policy_assignments, 0) AS policy_assignments,
  COALESCE(r.total_users, 0) AS total_users,
  COALESCE(r.admin_count, 0) AS admin_count,
  COALESCE(i.isolated_count, 0) AS isolated_agents,
  COALESCE(i.safe_mode_count, 0) AS safe_mode_agents,
  COALESCE(i.pending_revalidation, 0) AS pending_revalidation,
  CASE
    WHEN COALESCE(i.isolated_count, 0) > 0 OR COALESCE(i.safe_mode_count, 0) > 0 
    THEN 'critical'
    WHEN COALESCE(i.pending_revalidation, 0) > 0 THEN 'warning'
    WHEN COALESCE(e.active_policies, 0) = 0 THEN 'warning'
    ELSE 'healthy'
  END AS governance_status
FROM tenants t
LEFT JOIN v_enforcement_compliance e ON e.tenant_id = t.id
LEFT JOIN v_rbac_metrics r ON r.tenant_id = t.id
LEFT JOIN v_tenant_isolation_metrics i ON i.tenant_id = t.id
WHERE t.id IN (
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
)
OR is_current_super_admin();

-- 7. Recriar job_integrity_violations com filtro de tenant
DROP VIEW IF EXISTS job_integrity_violations CASCADE;
CREATE VIEW job_integrity_violations 
WITH (security_invoker = on) AS
SELECT 
  j.id AS job_id,
  j.agent_id,
  j.type AS job_type,
  j.status,
  j.created_at AS job_created_at,
  j.completed_at,
  CASE
    WHEN j.type = 'collect_web_activity' 
         AND NOT EXISTS (
           SELECT 1 FROM agent_web_activity aw
           WHERE aw.agent_id = j.agent_id 
           AND (aw.created_at >= j.created_at OR aw.visited_at >= j.created_at)
         ) 
    THEN 'missing_web_activity'
    WHEN j.type = 'collect_system_metrics' 
         AND NOT EXISTS (
           SELECT 1 FROM agent_system_metrics asm
           WHERE asm.agent_id = j.agent_id AND asm.created_at >= j.created_at
         ) 
    THEN 'missing_metrics'
    ELSE NULL
  END AS violation_type
FROM jobs j
WHERE j.status = 'completed' 
AND j.created_at > now() - interval '7 days'
AND (
  j.tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
  OR is_current_super_admin()
);

-- 8. Recriar insight_feedback_quality com filtro de tenant
DROP VIEW IF EXISTS insight_feedback_quality CASCADE;
CREATE VIEW insight_feedback_quality 
WITH (security_invoker = on) AS
SELECT 
  ai.insight_type,
  f.tenant_id,
  count(*) AS total_feedback,
  count(*) FILTER (WHERE f.feedback_type = 'useful') AS useful,
  count(*) FILTER (WHERE f.feedback_type = 'noise') AS noise,
  count(*) FILTER (WHERE f.feedback_type = 'false_positive') AS false_positive,
  round(
    (count(*) FILTER (WHERE f.feedback_type = 'useful')::numeric / 
     NULLIF(count(*), 0)::numeric) * 100, 2
  ) AS usefulness_rate
FROM ai_insight_feedback f
JOIN ai_insights ai ON ai.id = f.insight_id
WHERE f.tenant_id IN (
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
)
OR is_current_super_admin()
GROUP BY ai.insight_type, f.tenant_id;

-- =====================================================
-- FASE 4: Adicionar indices para performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_agents_tenant_archived 
  ON agents(tenant_id, archived_at) WHERE archived_at IS NULL;

CREATE INDEX IF NOT EXISTS idx_agents_tenant_heartbeat 
  ON agents(tenant_id, last_heartbeat DESC);

CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant 
  ON user_roles(user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status_created 
  ON jobs(tenant_id, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_system_metrics_agent_collected 
  ON agent_system_metrics(agent_id, collected_at DESC);