-- Adicionar coluna resolved_by na tabela system_alerts
-- Necessario para o trigger create_decision_event_from_alert funcionar

ALTER TABLE system_alerts 
ADD COLUMN IF NOT EXISTS resolved_by UUID;