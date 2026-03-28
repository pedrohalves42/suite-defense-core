-- Atualizar constraint para incluir novos tipos de decisao
ALTER TABLE decision_events DROP CONSTRAINT IF EXISTS decision_events_decision_type_check;

ALTER TABLE decision_events ADD CONSTRAINT decision_events_decision_type_check 
CHECK (
  (decision_type IS NULL) OR 
  (decision_type = ANY (ARRAY[
    'approval'::text, 
    'rejection'::text, 
    'escalation'::text, 
    'system'::text, 
    'alert_resolution'::text, 
    'alert_reopen'::text, 
    'compensating_action'::text, 
    'rollback'::text, 
    'safe_mode_release'::text, 
    'validation'::text,
    'policy_validation'::text,
    'ai_model_promotion'::text
  ]))
);