-- =====================================================
-- Complete Audit Infrastructure Implementation
-- =====================================================

-- Part 1: Add auto_execute column to decision_rules
ALTER TABLE decision_rules
ADD COLUMN IF NOT EXISTS auto_execute BOOLEAN DEFAULT false;

-- Enable auto_execute for low-risk rules
UPDATE decision_rules
SET auto_execute = true
WHERE code IN (
  'AUTO_REVERT_THROTTLE_006',
  'INSIGHT_IGNORED_009',
  'CLEANUP_OLD_DATA_007',
  'AUTO_ACKNOWLEDGE_008'
);

-- Index for performance
CREATE INDEX IF NOT EXISTS idx_decision_rules_auto_execute 
ON decision_rules(auto_execute) WHERE auto_execute = true;

-- =====================================================
-- Part 2: Backfill decision_events from ai_actions
-- =====================================================
INSERT INTO decision_events (tenant_id, rule_code, agent_id, agent_name, action, evidence, actions_executed, created_at)
SELECT 
  aa.tenant_id,
  COALESCE(aa.action_type, 'AI_ACTION_EXECUTED'),
  ai.agent_id,
  COALESCE(a.agent_name, 'system'),
  aa.action_type,
  jsonb_build_object(
    'source', 'ai_action_backfill',
    'action_id', aa.id,
    'insight_id', aa.insight_id,
    'status', aa.status
  ),
  jsonb_build_array(jsonb_build_object('type', aa.action_type, 'success', true)),
  COALESCE(aa.executed_at, aa.created_at)
FROM ai_actions aa
LEFT JOIN ai_insights ai ON ai.id = aa.insight_id
LEFT JOIN agents a ON a.id = ai.agent_id
WHERE aa.status = 'executed'
  AND NOT EXISTS (
    SELECT 1 FROM decision_events de 
    WHERE de.evidence->>'action_id' = aa.id::text
  );

-- =====================================================
-- Part 3: Updated get_audit_raw_metrics function
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_result jsonb;
BEGIN
  SELECT jsonb_build_object(
    'total_audit_logs', (SELECT COUNT(*) FROM audit_logs),
    'audit_logs_with_hash', (SELECT COUNT(*) FROM audit_logs WHERE integrity_hash IS NOT NULL),
    'decision_events_30d', (SELECT COUNT(*) FROM decision_events WHERE created_at >= now() - interval '30 days'),
    'auto_execute_rules', (SELECT COUNT(*) FROM decision_rules WHERE auto_execute = true),
    'job_success_rate', (
      SELECT COALESCE(ROUND(
        (COUNT(*) FILTER (WHERE status = 'completed')::numeric / 
         NULLIF(COUNT(*) FILTER (WHERE status IN ('completed', 'failed')), 0)) * 100, 2
      ), 0)
      FROM jobs
    ),
    'active_triggers', (
      SELECT COUNT(*) FROM pg_trigger t
      JOIN pg_class c ON t.tgrelid = c.oid
      WHERE NOT t.tgisinternal 
        AND c.relname IN ('ai_actions', 'playbook_executions', 'audit_logs')
    )
  ) INTO v_result;
  
  RETURN v_result;
END;
$$;