-- Adicionar colunas faltantes na tabela decision_events
-- Necessario para o trigger create_decision_event_from_alert funcionar

ALTER TABLE decision_events 
ADD COLUMN IF NOT EXISTS actor_type TEXT,
ADD COLUMN IF NOT EXISTS actor_id UUID,
ADD COLUMN IF NOT EXISTS justification TEXT,
ADD COLUMN IF NOT EXISTS human_reviewed BOOLEAN DEFAULT false;