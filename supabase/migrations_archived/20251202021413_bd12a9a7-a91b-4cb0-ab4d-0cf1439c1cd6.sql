-- Fase 8 (simplificada): Popular security_events apenas com alertas criticos

-- Inserir eventos de seguranca baseados em alertas criticos nao resolvidos
INSERT INTO security_events (tenant_id, agent_id, severity, title, description, status, data, created_at)
SELECT DISTINCT 
  sa.tenant_id,
  sa.agent_id,
  'high' as severity,
  sa.alert_type as title,
  sa.message as description,
  'open' as status,
  jsonb_build_object(
    'source', 'system_alerts',
    'alert_id', sa.id,
    'alert_type', sa.alert_type
  ) as data,
  sa.created_at
FROM system_alerts sa
WHERE sa.severity = 'critical'
  AND sa.resolved = false
  AND NOT EXISTS (
    SELECT 1 FROM security_events se 
    WHERE se.data->>'alert_id' = sa.id::text
  )
LIMIT 50;

-- Criar trigger para popular security_events automaticamente quando novos alertas criticos sao criados
CREATE OR REPLACE FUNCTION create_security_event_from_alert()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.severity = 'critical' AND NOT NEW.resolved THEN
    INSERT INTO security_events (tenant_id, agent_id, severity, title, description, status, data)
    VALUES (
      NEW.tenant_id,
      NEW.agent_id,
      'high',
      NEW.alert_type,
      NEW.message,
      'open',
      jsonb_build_object(
        'source', 'system_alerts',
        'alert_id', NEW.id,
        'alert_type', NEW.alert_type
      )
    );
  END IF;
  
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trigger_create_security_event_from_alert ON system_alerts;
CREATE TRIGGER trigger_create_security_event_from_alert
  AFTER INSERT ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION create_security_event_from_alert();