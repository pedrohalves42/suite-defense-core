
-- =====================================================
-- GOVERNANCE PACKAGE: Complete archived_at Bug Fix
-- Phase 1: Fix v_agent_lifecycle_state (TypeScript fix)
-- Phase 2: Migrate remaining views to active_agents
-- Phase 3: Archiving workflow infrastructure
-- =====================================================

-- =====================================================
-- PHASE 1: Fix v_agent_lifecycle_state View
-- Add missing columns: minutes_between_copy_and_install, is_stuck
-- =====================================================

DROP VIEW IF EXISTS public.v_agent_lifecycle_state;

CREATE VIEW public.v_agent_lifecycle_state AS
SELECT 
  id AS agent_id,
  agent_name,
  tenant_id,
  status AS agent_status,
  enrolled_at::text AS enrolled_at,
  last_heartbeat::text AS last_heartbeat,
  os_type,
  os_version,
  hostname,
  
  -- Installation stages timestamps
  (SELECT ia.created_at::text 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.event_type = 'generated'
   ORDER BY ia.created_at DESC LIMIT 1) AS generated_at,
   
  (SELECT ia.created_at::text 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded'
   ORDER BY ia.created_at DESC LIMIT 1) AS downloaded_at,
   
  (SELECT ia.created_at::text 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied'
   ORDER BY ia.created_at DESC LIMIT 1) AS command_copied_at,
   
  (SELECT ia.created_at::text 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation')
   ORDER BY ia.created_at DESC LIMIT 1) AS installed_at,
  
  -- Lifecycle stage determination
  CASE
    WHEN status = 'active' AND last_heartbeat > now() - interval '5 minutes' THEN 'active'
    WHEN EXISTS (
      SELECT 1 FROM installation_analytics ia 
      WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation')
    ) THEN 'installed_offline'
    WHEN EXISTS (
      SELECT 1 FROM installation_analytics ia 
      WHERE ia.agent_id = a.id AND ia.event_type = 'command_copied'
    ) THEN 'installing'
    WHEN EXISTS (
      SELECT 1 FROM installation_analytics ia 
      WHERE ia.agent_id = a.id AND ia.event_type = 'downloaded'
    ) THEN 'downloaded'
    WHEN EXISTS (
      SELECT 1 FROM installation_analytics ia 
      WHERE ia.agent_id = a.id AND ia.event_type = 'generated'
    ) THEN 'generated'
    ELSE 'unknown'
  END AS lifecycle_stage,
  
  -- Installation metrics
  (SELECT ia.installation_time_seconds 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id 
     AND ia.event_type IN ('installed', 'post_installation') 
     AND ia.success = true
   ORDER BY ia.created_at DESC LIMIT 1) AS installation_time_seconds,
   
  (SELECT ia.success 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation')
   ORDER BY ia.created_at DESC LIMIT 1) AS installation_success,
   
  (SELECT ia.network_connectivity 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.event_type IN ('installed', 'post_installation')
   ORDER BY ia.created_at DESC LIMIT 1) AS network_connectivity,
  
  -- Error tracking
  (SELECT ia.error_message 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.success = false
   ORDER BY ia.created_at DESC LIMIT 1) AS last_error_message,
   
  (SELECT ia.created_at::text 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id AND ia.success = false
   ORDER BY ia.created_at DESC LIMIT 1) AS last_error_at,
  
  -- Platform and method
  (SELECT ia.platform 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id
   ORDER BY ia.created_at DESC LIMIT 1) AS platform,
   
  (SELECT ia.installation_method 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id
   ORDER BY ia.created_at DESC LIMIT 1) AS installation_method,
  
  -- Metadata
  (SELECT ia.metadata 
   FROM installation_analytics ia 
   WHERE ia.agent_id = a.id
   ORDER BY ia.created_at DESC LIMIT 1) AS installation_metadata,
  
  -- Time calculations
  EXTRACT(EPOCH FROM (now() - last_heartbeat)) / 60 AS minutes_since_heartbeat,
  EXTRACT(EPOCH FROM (now() - enrolled_at)) / 60 AS minutes_since_enrollment,
  
  -- FIXED: Renamed from minutes_to_install to minutes_between_copy_and_install
  (SELECT EXTRACT(EPOCH FROM (
    (SELECT ia2.created_at FROM installation_analytics ia2 
     WHERE ia2.agent_id = a.id AND ia2.event_type IN ('installed', 'post_installation')
     ORDER BY ia2.created_at DESC LIMIT 1)
    -
    (SELECT ia3.created_at FROM installation_analytics ia3 
     WHERE ia3.agent_id = a.id AND ia3.event_type = 'command_copied'
     ORDER BY ia3.created_at DESC LIMIT 1)
  )) / 60) AS minutes_between_copy_and_install,
  
  -- NEW: is_stuck detection
  -- Stuck = command_copied > 30 min ago AND no installation event
  CASE
    WHEN EXISTS (
      SELECT 1 FROM installation_analytics ia 
      WHERE ia.agent_id = a.id 
        AND ia.event_type = 'command_copied'
        AND ia.created_at < now() - interval '30 minutes'
    ) AND NOT EXISTS (
      SELECT 1 FROM installation_analytics ia 
      WHERE ia.agent_id = a.id 
        AND ia.event_type IN ('installed', 'post_installation')
    ) THEN true
    ELSE false
  END AS is_stuck
  
FROM active_agents a;

-- =====================================================
-- PHASE 2: Migrate Remaining Views to active_agents
-- =====================================================

-- 2.1 v_problematic_agents
DROP VIEW IF EXISTS public.v_problematic_agents;

CREATE VIEW public.v_problematic_agents AS
SELECT 
  a.id,
  a.agent_name,
  a.status,
  a.enrolled_at::text AS enrolled_at,
  a.last_heartbeat::text AS last_heartbeat,
  a.hostname,
  a.os_type,
  a.tenant_id,
  t.name AS tenant_name,
  EXTRACT(EPOCH FROM (now() - a.enrolled_at)) / 60 AS minutes_since_enrollment,
  CASE
    WHEN a.status = 'pending' AND a.last_heartbeat IS NULL 
         AND a.enrolled_at < now() - interval '30 minutes' THEN 'never_connected'
    WHEN a.last_heartbeat IS NOT NULL 
         AND a.last_heartbeat < now() - interval '24 hours' THEN 'stale_heartbeat'
    WHEN a.status = 'error' THEN 'error_status'
    ELSE 'other'
  END AS issue_type,
  (SELECT COUNT(*)::integer FROM agent_tokens at WHERE at.agent_id = a.id) AS token_count,
  EXISTS (
    SELECT 1 FROM agent_tokens at 
    WHERE at.agent_id = a.id 
      AND at.is_active = true 
      AND (at.expires_at IS NULL OR at.expires_at > now())
  ) AS has_active_token,
  (SELECT COUNT(*)::integer FROM jobs j 
   WHERE j.agent_id = a.id 
     AND j.status IN ('queued', 'pending', 'delivered')) AS pending_jobs_count
FROM active_agents a
JOIN tenants t ON t.id = a.tenant_id
WHERE a.tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid())
  AND (
    (a.status = 'pending' AND a.last_heartbeat IS NULL AND a.enrolled_at < now() - interval '30 minutes')
    OR (a.last_heartbeat IS NOT NULL AND a.last_heartbeat < now() - interval '24 hours')
    OR a.status = 'error'
  );

-- 2.2 v_system_operations_summary
DROP VIEW IF EXISTS public.v_system_operations_summary;

CREATE VIEW public.v_system_operations_summary AS
SELECT 
  id AS tenant_id,
  name AS tenant_name,
  (SELECT COUNT(*) FROM active_agents WHERE active_agents.tenant_id = t.id) AS total_agents,
  (SELECT COUNT(*) FROM active_agents 
   WHERE active_agents.tenant_id = t.id 
     AND active_agents.last_heartbeat > now() - interval '5 minutes') AS online_agents,
  (SELECT COUNT(*) FROM active_agents 
   WHERE active_agents.tenant_id = t.id 
     AND (active_agents.last_heartbeat IS NULL OR active_agents.last_heartbeat < now() - interval '30 minutes')) AS offline_agents,
  (SELECT COUNT(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.created_at > now() - interval '24 hours') AS jobs_24h,
  (SELECT COUNT(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.status = 'completed' AND jobs.created_at > now() - interval '24 hours') AS jobs_completed_24h,
  (SELECT COUNT(*) FROM jobs WHERE jobs.tenant_id = t.id AND jobs.status = 'failed' AND jobs.created_at > now() - interval '24 hours') AS jobs_failed_24h,
  (SELECT COUNT(*) FROM system_alerts WHERE system_alerts.tenant_id = t.id AND system_alerts.acknowledged = false) AS open_alerts
FROM tenants t;

-- 2.3 v_tenant_plan_status
DROP VIEW IF EXISTS public.v_tenant_plan_status;

CREATE VIEW public.v_tenant_plan_status AS
SELECT 
  t.id AS tenant_id,
  t.name AS tenant_name,
  COALESCE(tf.quota_limit, 100) AS max_agents,
  (SELECT COUNT(*) FROM active_agents WHERE active_agents.tenant_id = t.id) AS current_agents,
  CASE
    WHEN COALESCE(tf.quota_limit, 100) > 0 
         AND (SELECT COUNT(*) FROM active_agents WHERE active_agents.tenant_id = t.id) >= COALESCE(tf.quota_limit, 100) 
    THEN 'limit_reached'
    WHEN COALESCE(tf.quota_limit, 100) > 0 
         AND (SELECT COUNT(*) FROM active_agents WHERE active_agents.tenant_id = t.id)::numeric >= COALESCE(tf.quota_limit, 100)::numeric * 0.9 
    THEN 'near_limit'
    ELSE 'ok'
  END AS agent_limit_status
FROM tenants t
LEFT JOIN tenant_features tf ON tf.tenant_id = t.id AND tf.feature_key = 'max_devices';

-- 2.4 hmac_signatures
DROP VIEW IF EXISTS public.hmac_signatures;

CREATE VIEW public.hmac_signatures AS
SELECT 
  id AS agent_id,
  agent_name,
  tenant_id,
  hmac_secret,
  signature_mode,
  result_public_key,
  result_key_fingerprint
FROM active_agents a
WHERE EXISTS (
  SELECT 1 FROM user_roles ur 
  WHERE ur.user_id = auth.uid() 
    AND ur.role IN ('admin', 'super_admin') 
    AND ur.tenant_id = a.tenant_id
);

-- 2.5 v_execution_chain_health
DROP VIEW IF EXISTS public.v_execution_chain_health;

CREATE VIEW public.v_execution_chain_health AS
SELECT 
  aec.agent_id,
  a.agent_name,
  a.status AS agent_status,
  aec.last_execution_index AS chain_index,
  COALESCE(MAX(je.execution_index), 0) AS actual_max_index,
  CASE
    WHEN COALESCE(MAX(je.execution_index), 0) > aec.last_execution_index THEN 'DESSINCRONIZADO'
    WHEN COALESCE(MAX(je.execution_index), 0) < aec.last_execution_index THEN 'CHAIN_AHEAD'
    ELSE 'OK'
  END AS sync_status,
  aec.updated_at AS chain_updated_at
FROM agent_execution_chain aec
JOIN active_agents a ON a.id = aec.agent_id
LEFT JOIN job_executions je ON je.agent_id = aec.agent_id
GROUP BY aec.agent_id, a.agent_name, a.status, aec.last_execution_index, aec.updated_at;

-- 2.6 v_action_center (complex UNION view)
DROP VIEW IF EXISTS public.v_action_center;

CREATE VIEW public.v_action_center AS
-- Playbook executions
SELECT 
  pe.id AS item_id,
  'playbook'::text AS source_type,
  pe.agent_id,
  a.agent_name,
  a.hostname,
  COALESCE(p.name, 'Playbook') AS title,
  COALESCE(pe.trigger_source, 'Acao pendente') AS description,
  COALESCE(p.severity, 'medium') AS severity,
  pe.risk_score,
  pe.trigger_context AS context,
  pe.triggered_at AS created_at,
  COALESCE(pe.trigger_source, 'manual') AS trigger_type,
  pe.playbook_id,
  pe.tenant_id,
  (CASE
    WHEN p.severity = 'critical' THEN 100
    WHEN p.severity = 'high' THEN 75
    WHEN p.severity = 'medium' THEN 50
    ELSE 25
  END)::numeric + COALESCE(pe.risk_score, 0) AS priority_score
FROM playbook_executions pe
LEFT JOIN active_agents a ON pe.agent_id = a.id
LEFT JOIN playbooks p ON pe.playbook_id = p.id
WHERE pe.status = 'pending'

UNION ALL

-- System alerts
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
WHERE sa.acknowledged = false

UNION ALL

-- Offline agents
SELECT 
  agt.id AS item_id,
  'agent_offline'::text AS source_type,
  agt.id AS agent_id,
  agt.agent_name,
  agt.hostname,
  'Agente Offline'::text AS title,
  COALESCE(agt.offline_reason, 'Sem comunicacao') AS description,
  CASE
    WHEN agt.offline_detected_at < now() - interval '24 hours' THEN 'critical'
    WHEN agt.offline_detected_at < now() - interval '4 hours' THEN 'high'
    ELSE 'medium'
  END AS severity,
  NULL::numeric AS risk_score,
  jsonb_build_object('last_heartbeat', agt.last_heartbeat, 'offline_since', agt.offline_detected_at) AS context,
  COALESCE(agt.offline_detected_at, agt.last_heartbeat) AS created_at,
  'agent_offline'::text AS trigger_type,
  NULL::uuid AS playbook_id,
  agt.tenant_id,
  CASE
    WHEN agt.offline_detected_at < now() - interval '24 hours' THEN 90
    WHEN agt.offline_detected_at < now() - interval '4 hours' THEN 60
    ELSE 30
  END AS priority_score
FROM active_agents agt
WHERE agt.status = 'offline'

UNION ALL

-- AI Insights
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
  jsonb_build_object(
    'insight_type', ins.insight_type,
    'category', ins.category,
    'recommended_actions', ins.recommended_actions,
    'affected_resources', ins.affected_resources,
    'evidence', ins.evidence,
    'auto_action_mode', ins.auto_action_mode,
    'auto_action_executed', ins.auto_action_executed
  ) AS context,
  ins.created_at,
  ins.insight_type AS trigger_type,
  NULL::uuid AS playbook_id,
  ins.tenant_id,
  CASE
    WHEN ins.severity = 'critical' THEN 100
    WHEN ins.severity = 'high' THEN 75
    WHEN ins.severity = 'medium' THEN 50
    ELSE 25
  END + COALESCE((ins.confidence_score * 10)::integer, 0) AS priority_score
FROM ai_insights ins
LEFT JOIN active_agents agt2 ON ins.agent_id = agt2.id
WHERE ins.acknowledged = false AND ins.auto_action_executed = false;

-- =====================================================
-- PHASE 3: Archiving Workflow Infrastructure
-- =====================================================

-- 3.1 Create agent_archive_events table
CREATE TABLE IF NOT EXISTS public.agent_archive_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id),
  reason text NOT NULL,
  actor_type text NOT NULL CHECK (actor_type IN ('system', 'human')),
  actor_id uuid,
  notes text,
  created_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_archive_events ENABLE ROW LEVEL SECURITY;

-- RLS policies for agent_archive_events
CREATE POLICY "Users can view archive events for their tenant agents"
ON public.agent_archive_events
FOR SELECT
USING (
  agent_id IN (
    SELECT a.id FROM agents a
    WHERE a.tenant_id IN (
      SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
    )
  )
);

CREATE POLICY "Admins can insert archive events"
ON public.agent_archive_events
FOR INSERT
WITH CHECK (
  agent_id IN (
    SELECT a.id FROM agents a
    WHERE a.tenant_id IN (
      SELECT ur.tenant_id FROM user_roles ur 
      WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
    )
  )
);

-- 3.2 Create archive_agent function
CREATE OR REPLACE FUNCTION public.archive_agent(
  p_agent_id uuid,
  p_reason text,
  p_actor_type text,
  p_actor_id uuid DEFAULT NULL,
  p_notes text DEFAULT NULL
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Validate actor_type
  IF p_actor_type NOT IN ('system', 'human') THEN
    RAISE EXCEPTION 'Invalid actor_type: %. Must be system or human', p_actor_type;
  END IF;

  -- Update the agent to archived
  UPDATE agents
  SET 
    archived_at = now(),
    archived_reason = p_reason
  WHERE id = p_agent_id
    AND archived_at IS NULL;

  -- Log the archive event
  INSERT INTO agent_archive_events (
    agent_id, 
    reason, 
    actor_type, 
    actor_id, 
    notes
  ) VALUES (
    p_agent_id, 
    p_reason, 
    p_actor_type, 
    p_actor_id, 
    p_notes
  );
END;
$$;

-- Create index for archive events lookup
CREATE INDEX IF NOT EXISTS idx_agent_archive_events_agent_id 
ON public.agent_archive_events(agent_id);

CREATE INDEX IF NOT EXISTS idx_agent_archive_events_created_at 
ON public.agent_archive_events(created_at DESC);
