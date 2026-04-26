-- =====================================================
-- CICLO 4: Regra de Reentrada de Agentes (Quarentena)
-- =====================================================

-- Adicionar colunas de revalidacao na tabela agents
ALTER TABLE agents 
ADD COLUMN IF NOT EXISTS requires_revalidation BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS revalidation_reason TEXT,
ADD COLUMN IF NOT EXISTS revalidation_required_at TIMESTAMPTZ;

-- Trigger para marcar agentes que ficaram offline > 7 dias
CREATE OR REPLACE FUNCTION fn_agent_reentry_check()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Se agente esta voltando de offline para online
  IF OLD.status = 'offline' AND NEW.status = 'online' THEN
    -- Se ficou offline por mais de 7 dias
    IF OLD.offline_detected_at IS NOT NULL 
       AND OLD.offline_detected_at < NOW() - INTERVAL '7 days' THEN
      NEW.requires_revalidation := true;
      NEW.revalidation_reason := 'Offline por mais de 7 dias - requer validacao antes de processar jobs criticos';
      NEW.revalidation_required_at := NOW();
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_agent_reentry_check ON agents;
CREATE TRIGGER trg_agent_reentry_check
BEFORE UPDATE ON agents
FOR EACH ROW
WHEN (OLD.status IS DISTINCT FROM NEW.status)
EXECUTE FUNCTION fn_agent_reentry_check();

-- Criar alerta automatico quando agente requer revalidacao
CREATE OR REPLACE FUNCTION fn_alert_agent_reentry()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.requires_revalidation = true AND (OLD.requires_revalidation IS NULL OR OLD.requires_revalidation = false) THEN
    INSERT INTO system_alerts (
      tenant_id, severity, type, title, message, agent_id, created_at
    ) VALUES (
      NEW.tenant_id, 
      'medium', 
      'agent_reentry_validation',
      'Agente requer revalidacao',
      format('O agente %s ficou offline por periodo prolongado e requer validacao antes de processar jobs criticos.', NEW.agent_name),
      NEW.id,
      NOW()
    );
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_alert_agent_reentry ON agents;
CREATE TRIGGER trg_alert_agent_reentry
AFTER UPDATE ON agents
FOR EACH ROW
EXECUTE FUNCTION fn_alert_agent_reentry();