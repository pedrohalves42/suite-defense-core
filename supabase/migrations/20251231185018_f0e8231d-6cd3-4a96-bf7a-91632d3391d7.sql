-- =====================================================
-- Part 2: Triggers for automatic decision events
-- =====================================================

-- Trigger function: Create decision_event when AI action is executed
CREATE OR REPLACE FUNCTION public.create_decision_event_from_ai_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_rule_code TEXT;
  v_agent_id UUID;
  v_agent_name TEXT;
BEGIN
  v_rule_code := COALESCE(NEW.action_type, 'AI_ACTION_EXECUTED');
  
  SELECT ai.agent_id, a.agent_name INTO v_agent_id, v_agent_name
  FROM ai_insights ai
  LEFT JOIN agents a ON a.id = ai.agent_id
  WHERE ai.id = NEW.insight_id
  LIMIT 1;
  
  INSERT INTO decision_events (
    tenant_id, rule_code, agent_id, agent_name, action, evidence, executed_actions
  ) VALUES (
    NEW.tenant_id,
    v_rule_code,
    v_agent_id,
    COALESCE(v_agent_name, 'system'),
    NEW.action_type,
    jsonb_build_object('source', 'ai_action', 'action_id', NEW.id, 'insight_id', NEW.insight_id, 'triggered_at', NOW()),
    CASE WHEN NEW.status = 'executed' THEN 
      jsonb_build_array(jsonb_build_object('action', NEW.action_type, 'status', 'executed'))
    ELSE jsonb_build_array() END
  );
  
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_create_decision_event_on_ai_action ON ai_actions;
CREATE TRIGGER trg_create_decision_event_on_ai_action
AFTER UPDATE ON ai_actions
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status AND NEW.status = 'executed')
EXECUTE FUNCTION create_decision_event_from_ai_action();

DROP TRIGGER IF EXISTS trg_create_decision_event_on_ai_action_insert ON ai_actions;
CREATE TRIGGER trg_create_decision_event_on_ai_action_insert
AFTER INSERT ON ai_actions
FOR EACH ROW
WHEN (NEW.status = 'executed')
EXECUTE FUNCTION create_decision_event_from_ai_action();

-- Trigger function: Create decision_event when playbook is executed
CREATE OR REPLACE FUNCTION public.create_decision_event_from_playbook()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  v_playbook_name TEXT;
BEGIN
  SELECT name INTO v_playbook_name FROM playbooks WHERE id = NEW.playbook_id;
  
  INSERT INTO decision_events (
    tenant_id, rule_code, agent_id, agent_name, action, evidence, executed_actions
  ) VALUES (
    NEW.tenant_id,
    'PLAYBOOK_EXECUTED',
    NEW.agent_id,
    COALESCE((SELECT agent_name FROM agents WHERE id = NEW.agent_id), 'system'),
    v_playbook_name,
    jsonb_build_object('source', 'playbook_execution', 'execution_id', NEW.id, 'playbook_id', NEW.playbook_id, 'status', NEW.status),
    COALESCE(NEW.execution_log, '[]'::jsonb)
  );
  
  RETURN NEW;
END;
$function$;

DROP TRIGGER IF EXISTS trg_create_decision_event_on_playbook ON playbook_executions;
CREATE TRIGGER trg_create_decision_event_on_playbook
AFTER INSERT ON playbook_executions
FOR EACH ROW
WHEN (NEW.status IN ('completed', 'partial'))
EXECUTE FUNCTION create_decision_event_from_playbook();