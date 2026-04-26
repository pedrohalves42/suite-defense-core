-- =====================================================
-- FIX: Decision Events Infrastructure
-- Corrige trigger duplicado, bug de coluna, e idempotencia
-- =====================================================

-- FASE 1: Remover trigger duplicado (INSERT)
DROP TRIGGER IF EXISTS trg_create_decision_event_on_ai_action_insert ON ai_actions;

-- FASE 2: Criar indice de idempotencia ANTES da funcao
CREATE UNIQUE INDEX IF NOT EXISTS ux_decision_events_action_id 
ON decision_events ((evidence->>'action_id'))
WHERE evidence->>'action_id' IS NOT NULL;

-- FASE 3: Corrigir funcao do trigger (bug da coluna + idempotencia)
CREATE OR REPLACE FUNCTION public.create_decision_event_from_ai_action()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_agent_id UUID;
  v_agent_name TEXT;
  v_action_id TEXT;
BEGIN
  -- Guard: so processa status finais
  IF NEW.status NOT IN ('executed', 'skipped') THEN
    RETURN NEW;
  END IF;

  -- Verificar se ja existe evento para esta action (idempotencia)
  v_action_id := NEW.id::text;
  IF EXISTS (
    SELECT 1 FROM decision_events 
    WHERE evidence->>'action_id' = v_action_id
  ) THEN
    RETURN NEW; -- Ja registrado, pular
  END IF;

  -- Buscar dados do agente
  SELECT ai.agent_id, a.agent_name 
  INTO v_agent_id, v_agent_name
  FROM ai_insights ai
  LEFT JOIN agents a ON a.id = ai.agent_id
  WHERE ai.id = NEW.insight_id
  LIMIT 1;

  -- Inserir decision_event (nome correto: actions_executed, nao executed_actions)
  INSERT INTO decision_events (
    tenant_id, 
    rule_code, 
    agent_id, 
    agent_name, 
    action, 
    evidence, 
    actions_executed
  ) VALUES (
    NEW.tenant_id,
    COALESCE(NEW.action_type, 'AI_ACTION'),
    v_agent_id,
    COALESCE(v_agent_name, 'system'),
    NEW.action_type,
    jsonb_build_object(
      'source', 'ai_action_trigger',
      'action_id', NEW.id,
      'insight_id', NEW.insight_id,
      'status', NEW.status,
      'triggered_at', NOW()
    ),
    CASE WHEN NEW.status = 'executed' THEN 
      jsonb_build_array(jsonb_build_object('type', NEW.action_type, 'success', true))
    ELSE 
      jsonb_build_array() 
    END
  );

  RETURN NEW;
END;
$$;

-- FASE 4: Recriar trigger (apenas UPDATE, com guard forte)
DROP TRIGGER IF EXISTS trg_create_decision_event_on_ai_action ON ai_actions;

CREATE TRIGGER trg_create_decision_event_on_ai_action
AFTER UPDATE ON ai_actions
FOR EACH ROW
WHEN (
  OLD.status IS DISTINCT FROM NEW.status
  AND NEW.status IN ('executed', 'skipped')
)
EXECUTE FUNCTION public.create_decision_event_from_ai_action();