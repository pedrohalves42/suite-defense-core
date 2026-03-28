
-- Corrigir funcao create_decision_event_from_ai_action
-- Remove referencias a colunas que nao existem (rule_code, agent_id, agent_name)

CREATE OR REPLACE FUNCTION create_decision_event_from_ai_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_insight_record RECORD;
BEGIN
  -- Buscar informacoes do insight associado (que tem agent_id e agent_name)
  SELECT 
    agent_id,
    agent_name,
    insight_type
  INTO v_insight_record
  FROM ai_insights
  WHERE id = NEW.insight_id;

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
    COALESCE(v_insight_record.insight_type, 'AI_ACTION'),
    v_insight_record.agent_id,
    v_insight_record.agent_name,
    NEW.action_type,
    jsonb_build_object(
      'ai_action_id', NEW.id,
      'insight_id', NEW.insight_id,
      'status', NEW.status,
      'risk', NEW.risk_level,
      'human_reviewed', COALESCE(NEW.human_reviewed, false),
      'ai_validation', NEW.ai_validation_status
    ),
    jsonb_build_array(
      jsonb_build_object(
        'type', NEW.action_type,
        'success', NEW.status = 'executed'
      )
    ),
    CASE WHEN COALESCE(NEW.human_reviewed, false) THEN 'human' ELSE 'ai' END,
    CASE NEW.status 
      WHEN 'executed' THEN 'approval' 
      WHEN 'failed' THEN 'rejection' 
      ELSE 'system' 
    END,
    NOW()
  );
  RETURN NEW;
EXCEPTION
  WHEN OTHERS THEN
    -- Log error but don't block the original operation
    RAISE WARNING 'create_decision_event_from_ai_action failed: %', SQLERRM;
    RETURN NEW;
END;
$$;
