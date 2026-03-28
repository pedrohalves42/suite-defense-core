
-- =====================================================
-- MIGRATION: Atualizar get_audit_raw_metrics() com metricas de governanca
-- =====================================================

DROP FUNCTION IF EXISTS get_audit_raw_metrics(uuid);

CREATE OR REPLACE FUNCTION get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  WITH
  -- JOBS (30d)
  job_stats AS (
    SELECT
      COUNT(*) FILTER (WHERE status = 'completed') AS completed,
      COUNT(*) FILTER (WHERE status = 'failed') AS failed,
      COUNT(*) AS total
    FROM jobs
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
      AND id NOT IN (SELECT job_id FROM failed_jobs_dlq)
  ),
  -- DLQ
  dlq_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status != 'pending') AS reviewed
    FROM failed_jobs_dlq
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- INSIGHTS
  insight_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status != 'open') AS resolved
    FROM ai_insights
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- ACTIONS
  action_stats AS (
    SELECT COUNT(*) FILTER (WHERE status = 'executed') AS executed
    FROM ai_actions
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- DECISIONS
  decision_stats AS (
    SELECT COUNT(*) AS total
    FROM decision_events
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- APPROVALS (Governanca)
  approval_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE status = 'approved') AS approved,
      COUNT(*) FILTER (WHERE status = 'rejected') AS rejected,
      COUNT(*) FILTER (WHERE status = 'pending') AS pending
    FROM approval_requests
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  ),
  -- AUDIT LOGS
  audit_stats AS (
    SELECT
      COUNT(*) AS total,
      COUNT(*) FILTER (WHERE integrity_hash IS NOT NULL) AS with_hash
    FROM audit_logs
    WHERE tenant_id = p_tenant_id
      AND created_at >= now() - interval '30 days'
  )
  SELECT jsonb_build_object(
    -- OPERATIONS
    'job_success_rate', CASE WHEN job_stats.total > 0 
      THEN ROUND(job_stats.completed::numeric / job_stats.total * 100, 2) ELSE 0 END,
    'failed_jobs_30d', job_stats.failed,
    'real_failures_30d', job_stats.failed,
    
    -- DLQ RESILIENCE
    'dlq_jobs_30d', dlq_stats.total,
    'dlq_reviewed_30d', dlq_stats.reviewed,
    'dlq_review_rate', CASE WHEN dlq_stats.total > 0 
      THEN ROUND(dlq_stats.reviewed::numeric / dlq_stats.total * 100, 2) ELSE 0 END,
    
    -- INSIGHTS ? ACTIONS
    'ai_insights_30d', insight_stats.total,
    'insights_resolved_30d', insight_stats.resolved,
    'insights_resolution_rate', CASE WHEN insight_stats.total > 0 
      THEN ROUND(insight_stats.resolved::numeric / insight_stats.total * 100, 2) ELSE 0 END,
    'ai_actions_executed', action_stats.executed,
    'action_rate_pct', CASE WHEN insight_stats.total > 0 
      THEN ROUND(action_stats.executed::numeric / insight_stats.total * 100, 2) ELSE 0 END,
    
    -- DECISION GOVERNANCE
    'decision_events_30d', decision_stats.total,
    
    -- HUMAN OVERSIGHT
    'approval_requests_30d', approval_stats.total,
    'approved_requests_30d', approval_stats.approved,
    'rejected_requests_30d', approval_stats.rejected,
    'pending_approvals', approval_stats.pending,
    'human_review_rate', CASE WHEN action_stats.executed > 0 
      THEN ROUND(approval_stats.total::numeric / action_stats.executed * 100, 2) ELSE 0 END,
    
    -- AUDIT / EVIDENCE
    'audit_logs_30d', audit_stats.total,
    'audit_logs_with_hash', audit_stats.with_hash,
    
    -- POLICY / RULES
    'auto_execute_rules', (SELECT COUNT(*) FROM decision_rules WHERE is_enabled = true AND auto_execute = true)
  )
  INTO result
  FROM job_stats, dlq_stats, insight_stats, action_stats, decision_stats, approval_stats, audit_stats;

  RETURN result;
END;
$$;

-- =====================================================
-- TRIGGER: Policy Enforcement ? Decision Events
-- =====================================================

CREATE OR REPLACE FUNCTION trg_decision_event_from_policy()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  INSERT INTO decision_events (tenant_id, rule_code, agent_id, agent_name, action, evidence, actions_executed)
  VALUES (
    NEW.tenant_id, 
    NEW.rule_type, 
    NEW.agent_id, 
    'policy_engine', 
    NEW.action_taken,
    jsonb_build_object(
      'policy_id', NEW.policy_id, 
      'rule_id', NEW.rule_id, 
      'target', NEW.target, 
      'blocked', NEW.blocked,
      'source', 'policy_enforcement'
    ),
    jsonb_build_array(jsonb_build_object('type', NEW.action_taken, 'success', true, 'auto', true))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_policy_decision_event ON policy_enforcement_logs;
CREATE TRIGGER trg_policy_decision_event
AFTER INSERT ON policy_enforcement_logs
FOR EACH ROW 
EXECUTE FUNCTION trg_decision_event_from_policy();

-- =====================================================
-- TRIGGER: AI Actions ? Decision Events
-- =====================================================

CREATE OR REPLACE FUNCTION trg_decision_event_from_ai_action()
RETURNS TRIGGER 
LANGUAGE plpgsql 
SECURITY DEFINER 
SET search_path = public
AS $$
BEGIN
  -- Evitar duplicacao
  IF EXISTS (SELECT 1 FROM decision_events WHERE evidence->>'action_id' = NEW.id::text) THEN
    RETURN NEW;
  END IF;
  
  INSERT INTO decision_events (tenant_id, rule_code, agent_id, agent_name, action, evidence, actions_executed)
  VALUES (
    NEW.tenant_id, 
    NEW.action_type, 
    NULL, 
    'ai_engine', 
    NEW.status,
    jsonb_build_object(
      'action_id', NEW.id, 
      'insight_id', NEW.insight_id, 
      'error', NEW.error_message,
      'source', 'ai_action_execution'
    ),
    jsonb_build_array(jsonb_build_object('type', NEW.action_type, 'status', NEW.status))
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_action_decision_event ON ai_actions;
CREATE TRIGGER trg_ai_action_decision_event
AFTER UPDATE OF status ON ai_actions
FOR EACH ROW 
WHEN (NEW.status IN ('executed', 'failed', 'rejected'))
EXECUTE FUNCTION trg_decision_event_from_ai_action();
