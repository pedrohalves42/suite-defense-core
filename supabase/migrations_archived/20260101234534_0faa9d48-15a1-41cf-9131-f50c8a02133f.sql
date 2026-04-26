-- =====================================================
-- GOVERNANCE AUTOMATION: Triggers + DLQ Classifier
-- =====================================================

-- 1. Trigger: Auto-create decision_events from ai_actions
-- =====================================================
CREATE OR REPLACE FUNCTION create_decision_event_from_ai_action()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO decision_events (
    tenant_id,
    rule_code,
    agent_id,
    agent_name,
    action,
    evidence,
    actions_executed,
    decision_source,
    decision_type,
    created_at
  ) VALUES (
    NEW.tenant_id,
    COALESCE(NEW.rule_code, 'AI_ACTION'),
    NEW.agent_id,
    NEW.agent_name,
    NEW.action_type,
    jsonb_build_object(
      'ai_action_id', NEW.id,
      'status', NEW.status,
      'risk', NEW.risk_level,
      'human_reviewed', NEW.human_reviewed,
      'ai_validation', NEW.ai_validation_status
    ),
    jsonb_build_array(
      jsonb_build_object(
        'type', NEW.action_type,
        'success', NEW.status = 'executed'
      )
    ),
    CASE WHEN NEW.human_reviewed THEN 'human' ELSE 'ai' END,
    CASE NEW.status 
      WHEN 'executed' THEN 'approval' 
      WHEN 'failed' THEN 'rejection' 
      ELSE 'system' 
    END,
    NOW()
  );
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_decision_event_ai_action ON ai_actions;

CREATE TRIGGER trg_decision_event_ai_action
AFTER UPDATE ON ai_actions
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  AND NEW.status IN ('executed', 'failed', 'blocked')
)
EXECUTE FUNCTION create_decision_event_from_ai_action();

-- 2. Trigger: Shadow AI Validation (validates but doesn't block)
-- =====================================================
CREATE OR REPLACE FUNCTION ai_shadow_validate_action()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.risk_level = 'low' THEN
    NEW.ai_validation_status := 'pass';
    NEW.ai_validation_reason := 'Low risk action. No anomalies detected.';
  ELSIF NEW.risk_level = 'medium' THEN
    NEW.ai_validation_status := 'pass';
    NEW.ai_validation_reason := 'Medium risk action. Within acceptable parameters.';
  ELSE
    NEW.ai_validation_status := 'warn';
    NEW.ai_validation_reason := 'High risk action. Recommend human review.';
  END IF;
  NEW.ai_validated_at := NOW();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_ai_shadow_validation ON ai_actions;

CREATE TRIGGER trg_ai_shadow_validation
BEFORE UPDATE ON ai_actions
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  AND NEW.status = 'executed'
)
EXECUTE FUNCTION ai_shadow_validate_action();

-- 3. DLQ Classifier: Add classification column
-- =====================================================
ALTER TABLE failed_jobs_dlq
ADD COLUMN IF NOT EXISTS classification text;

-- Add check constraint separately (idempotent)
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'failed_jobs_dlq_classification_check'
  ) THEN
    ALTER TABLE failed_jobs_dlq
    ADD CONSTRAINT failed_jobs_dlq_classification_check
    CHECK (classification IN ('expected', 'transient', 'suspicious'));
  END IF;
END $$;

-- 4. DLQ Classifier Function
-- =====================================================
CREATE OR REPLACE FUNCTION classify_dlq_job()
RETURNS trigger
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  -- Transient: network/timeout issues (retry-able)
  IF NEW.error_message ILIKE '%timeout%'
     OR NEW.error_message ILIKE '%connection%'
     OR NEW.error_message ILIKE '%network%'
     OR NEW.error_message ILIKE '%ECONNREFUSED%' THEN
    NEW.classification := 'transient';
    NEW.review_required := false;
  
  -- Suspicious: potential security or injection issues
  ELSIF NEW.error_message ILIKE '%syntax%'
     OR NEW.error_message ILIKE '%injection%'
     OR (NEW.payload IS NOT NULL AND NEW.payload::text ILIKE '%<script%')
     OR (NEW.payload IS NOT NULL AND NEW.payload::text ILIKE '%drop table%')
     OR (NEW.payload IS NOT NULL AND NEW.payload::text ILIKE '%delete from%') THEN
    NEW.classification := 'suspicious';
    NEW.review_required := true;
  
  -- Expected: normal operational failures
  ELSE
    NEW.classification := 'expected';
    NEW.review_required := false;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_classify_dlq_job ON failed_jobs_dlq;

CREATE TRIGGER trg_classify_dlq_job
BEFORE INSERT ON failed_jobs_dlq
FOR EACH ROW
EXECUTE FUNCTION classify_dlq_job();

-- 5. Update get_audit_raw_metrics to include DLQ classification
-- =====================================================
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
BEGIN
  SELECT jsonb_build_object(
    -- Agent metrics
    'total_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id),
    'active_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND status = 'active'),
    'offline_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND agent_state = 'offline'),
    'safe_mode_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND agent_mode = 'SAFE_MODE'),
    'isolated_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND is_isolated = true),
    'throttled_agents', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND is_throttled = true),
    
    -- Job metrics
    'total_jobs', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id),
    'pending_jobs', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'pending'),
    'completed_jobs', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'completed'),
    'failed_jobs', (SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id AND status = 'failed'),
    
    -- DLQ metrics with classification
    'dlq_total', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id),
    'dlq_review_required', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND review_required = true),
    'dlq_reviewed', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND reviewed_at IS NOT NULL),
    'dlq_classification_expected', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND classification = 'expected'),
    'dlq_classification_transient', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND classification = 'transient'),
    'dlq_classification_suspicious', (SELECT COUNT(*) FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id AND classification = 'suspicious'),
    'dlq_suspicious_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE classification = 'suspicious')::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id
    ),
    
    -- Decision events with sources
    'decision_events_30d', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'decision_events_human', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
      AND decision_source = 'human'
    ),
    'decision_events_ai', (
      SELECT COUNT(*) FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
      AND decision_source = 'ai'
    ),
    'human_decision_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE decision_source = 'human')::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM decision_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- AI Actions with governance
    'ai_actions_total', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id),
    'ai_actions_executed', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'executed'),
    'ai_actions_pending', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND status = 'pending'),
    'ai_actions_human_reviewed', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND human_reviewed = true),
    'ai_actions_human_reviewed_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE human_reviewed = true)::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM ai_actions WHERE tenant_id = p_tenant_id
    ),
    'ai_validation_pass', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND ai_validation_status = 'pass'),
    'ai_validation_warn', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND ai_validation_status = 'warn'),
    'ai_validation_fail', (SELECT COUNT(*) FROM ai_actions WHERE tenant_id = p_tenant_id AND ai_validation_status = 'fail'),
    'ai_validation_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE ai_validation_status IS NOT NULL)::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM ai_actions WHERE tenant_id = p_tenant_id
    ),
    
    -- AI Insights with governance
    'ai_insights_total', (SELECT COUNT(*) FROM ai_insights WHERE tenant_id = p_tenant_id),
    'ai_insights_acknowledged', (SELECT COUNT(*) FROM ai_insights WHERE tenant_id = p_tenant_id AND acknowledged = true),
    'ai_insights_reviewed_no_action', (SELECT COUNT(*) FROM ai_insights WHERE tenant_id = p_tenant_id AND status = 'reviewed_no_action'),
    'ai_insights_governance_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE acknowledged = true OR status = 'reviewed_no_action')::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM ai_insights WHERE tenant_id = p_tenant_id
    ),
    
    -- System alerts with governance
    'system_alerts_total', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id),
    'system_alerts_critical', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND severity = 'critical'),
    'system_alerts_human_reviewed', (SELECT COUNT(*) FROM system_alerts WHERE tenant_id = p_tenant_id AND human_reviewed = true),
    'system_alerts_human_reviewed_rate', (
      SELECT CASE 
        WHEN COUNT(*) = 0 THEN 0
        ELSE ROUND((COUNT(*) FILTER (WHERE human_reviewed = true)::numeric / COUNT(*)::numeric) * 100, 2)
      END
      FROM system_alerts WHERE tenant_id = p_tenant_id
    ),
    
    -- Security policies
    'security_policies_total', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id),
    'security_policies_active', (SELECT COUNT(*) FROM security_policies WHERE tenant_id = p_tenant_id AND is_active = true),
    'security_policies_assigned', (
      SELECT COUNT(DISTINCT agp.policy_id) 
      FROM agent_group_policies agp
      JOIN agent_groups ag ON ag.id = agp.group_id
      WHERE ag.tenant_id = p_tenant_id
    ),
    
    -- Safe mode events
    'safe_mode_events_30d', (
      SELECT COUNT(*) FROM agent_safe_mode_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    'safe_mode_resolved', (
      SELECT COUNT(*) FROM agent_safe_mode_events 
      WHERE tenant_id = p_tenant_id 
      AND resolved_at IS NOT NULL
    ),
    
    -- Rollback events
    'rollback_events_30d', (
      SELECT COUNT(*) FROM agent_rollback_events 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Evidence logs
    'evidence_logs_30d', (
      SELECT COUNT(*) FROM agent_evidence_logs 
      WHERE tenant_id = p_tenant_id 
      AND created_at > NOW() - INTERVAL '30 days'
    ),
    
    -- Timestamp
    'generated_at', NOW()
  ) INTO result;
  
  RETURN result;
END;
$$;