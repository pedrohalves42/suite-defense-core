-- 1. Drop existing view first (to allow changes)
DROP VIEW IF EXISTS v_action_center;

-- 2. Add missing columns to ai_insights
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS agent_id UUID REFERENCES agents(id);
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS category TEXT;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS recommended_actions JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS affected_resources JSONB DEFAULT '[]'::jsonb;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS auto_action_mode TEXT DEFAULT 'suggest';
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS auto_action_executed BOOLEAN DEFAULT false;
ALTER TABLE ai_insights ADD COLUMN IF NOT EXISTS auto_action_executed_at TIMESTAMPTZ;

-- Add check constraint separately to avoid issues with IF NOT EXISTS
DO $$ 
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'ai_insights_auto_action_mode_check'
  ) THEN
    ALTER TABLE ai_insights ADD CONSTRAINT ai_insights_auto_action_mode_check 
      CHECK (auto_action_mode IN ('none', 'suggest', 'auto', 'auto_with_approval'));
  END IF;
END $$;

-- 3. Recreate v_action_center view with ai_insights
CREATE VIEW v_action_center AS
-- Playbook executions pending
SELECT 
  pe.id as item_id,
  'playbook'::text as source_type,
  pe.agent_id,
  a.agent_name,
  a.hostname,
  COALESCE(p.name, 'Playbook') as title,
  COALESCE(pe.trigger_source, 'Acao pendente') as description,
  COALESCE(p.severity, 'medium') as severity,
  pe.risk_score,
  pe.trigger_context as context,
  pe.triggered_at as created_at,
  COALESCE(pe.trigger_source, 'manual') as trigger_type,
  pe.playbook_id,
  pe.tenant_id,
  CASE 
    WHEN p.severity = 'critical' THEN 100
    WHEN p.severity = 'high' THEN 75
    WHEN p.severity = 'medium' THEN 50
    ELSE 25
  END + COALESCE(pe.risk_score, 0) as priority_score
FROM playbook_executions pe
LEFT JOIN agents a ON pe.agent_id = a.id
LEFT JOIN playbooks p ON pe.playbook_id = p.id
WHERE pe.status = 'pending'

UNION ALL

-- System alerts not acknowledged
SELECT 
  sa.id as item_id,
  'alert'::text as source_type,
  sa.agent_id,
  ag.agent_name,
  ag.hostname,
  sa.alert_type as title,
  sa.message as description,
  sa.severity,
  NULL::numeric as risk_score,
  sa.details as context,
  sa.created_at,
  sa.alert_type as trigger_type,
  NULL::uuid as playbook_id,
  sa.tenant_id,
  CASE 
    WHEN sa.severity = 'critical' THEN 100
    WHEN sa.severity = 'high' THEN 75
    WHEN sa.severity = 'medium' THEN 50
    ELSE 25
  END as priority_score
FROM system_alerts sa
LEFT JOIN agents ag ON sa.agent_id = ag.id
WHERE sa.acknowledged = false

UNION ALL

-- Agents offline
SELECT 
  agt.id as item_id,
  'agent_offline'::text as source_type,
  agt.id as agent_id,
  agt.agent_name,
  agt.hostname,
  'Agente Offline' as title,
  COALESCE(agt.offline_reason, 'Sem comunicacao') as description,
  CASE 
    WHEN agt.offline_detected_at < NOW() - INTERVAL '24 hours' THEN 'critical'
    WHEN agt.offline_detected_at < NOW() - INTERVAL '4 hours' THEN 'high'
    ELSE 'medium'
  END as severity,
  NULL::numeric as risk_score,
  jsonb_build_object(
    'last_heartbeat', agt.last_heartbeat,
    'offline_since', agt.offline_detected_at
  ) as context,
  COALESCE(agt.offline_detected_at, agt.last_heartbeat) as created_at,
  'agent_offline' as trigger_type,
  NULL::uuid as playbook_id,
  agt.tenant_id,
  CASE 
    WHEN agt.offline_detected_at < NOW() - INTERVAL '24 hours' THEN 90
    WHEN agt.offline_detected_at < NOW() - INTERVAL '4 hours' THEN 60
    ELSE 30
  END as priority_score
FROM agents agt
WHERE agt.status = 'offline'

UNION ALL

-- AI Insights not acknowledged
SELECT 
  ins.id as item_id,
  'ai_insight'::text as source_type,
  ins.agent_id,
  agt2.agent_name,
  agt2.hostname,
  ins.title,
  ins.description,
  ins.severity,
  ins.confidence_score as risk_score,
  jsonb_build_object(
    'insight_type', ins.insight_type,
    'category', ins.category,
    'recommended_actions', ins.recommended_actions,
    'affected_resources', ins.affected_resources,
    'evidence', ins.evidence,
    'auto_action_mode', ins.auto_action_mode,
    'auto_action_executed', ins.auto_action_executed
  ) as context,
  ins.created_at,
  ins.insight_type as trigger_type,
  NULL::uuid as playbook_id,
  ins.tenant_id,
  CASE 
    WHEN ins.severity = 'critical' THEN 100
    WHEN ins.severity = 'high' THEN 75
    WHEN ins.severity = 'medium' THEN 50
    ELSE 25
  END + COALESCE((ins.confidence_score * 10)::int, 0) as priority_score
FROM ai_insights ins
LEFT JOIN agents agt2 ON ins.agent_id = agt2.id
WHERE ins.acknowledged = false
  AND ins.auto_action_executed = false;