-- Funcao para detectar multiplos bloqueios DNS e criar evento de playbook
CREATE OR REPLACE FUNCTION trigger_playbook_on_multiple_dns_blocks()
RETURNS TRIGGER 
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_blocked_count INTEGER;
  v_tenant_id UUID;
  v_existing_pending INTEGER;
BEGIN
  -- So processar bloqueios
  IF NOT NEW.is_blocked THEN
    RETURN NEW;
  END IF;
  
  -- Contar bloqueios na ultima hora para este agente
  SELECT COUNT(*) INTO v_blocked_count
  FROM agent_web_activity aw
  WHERE aw.agent_id = NEW.agent_id
    AND aw.is_blocked = true
    AND aw.created_at > NOW() - INTERVAL '1 hour';
  
  -- Buscar tenant do agente
  SELECT a.tenant_id INTO v_tenant_id
  FROM agents a
  WHERE a.id = NEW.agent_id;
  
  -- Se nao atingiu threshold, retornar
  IF v_blocked_count < 10 OR v_tenant_id IS NULL THEN
    RETURN NEW;
  END IF;
  
  -- Anti-loop: Verificar se ja existe evento pendente para este agente nas ultimas 2 horas
  SELECT COUNT(*) INTO v_existing_pending
  FROM ai_action_logs
  WHERE tenant_id = v_tenant_id
    AND action_type = 'playbook_trigger_evaluation'
    AND status IN ('pending', 'processing')
    AND action_data->>'trigger_type' = 'dns_blocked'
    AND action_data->>'agent_id' = NEW.agent_id::text
    AND created_at > NOW() - INTERVAL '2 hours';
  
  IF v_existing_pending > 0 THEN
    RETURN NEW; -- Ja existe evento pendente, nao criar duplicado
  END IF;
  
  -- Criar evento para playbook
  INSERT INTO ai_action_logs (
    tenant_id,
    action_type,
    action_data,
    status
  ) VALUES (
    v_tenant_id,
    'playbook_trigger_evaluation',
    jsonb_build_object(
      'trigger_type', 'dns_blocked',
      'agent_id', NEW.agent_id,
      'blocked_count', v_blocked_count,
      'time_window_hours', 1,
      'latest_domain', NEW.domain,
      'category', NEW.category,
      'created_by_trigger', 'tr_playbook_on_dns_blocks'
    ),
    'pending'
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Nao falhar a insercao por causa do trigger
  RAISE WARNING 'trigger_playbook_on_multiple_dns_blocks failed: %', SQLERRM;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Criar trigger para bloqueios DNS
DROP TRIGGER IF EXISTS tr_playbook_on_dns_blocks ON agent_web_activity;
CREATE TRIGGER tr_playbook_on_dns_blocks
  AFTER INSERT ON agent_web_activity
  FOR EACH ROW
  WHEN (NEW.is_blocked = true)
  EXECUTE FUNCTION trigger_playbook_on_multiple_dns_blocks();

COMMENT ON TRIGGER tr_playbook_on_dns_blocks ON agent_web_activity IS 
'Dispara evento de playbook quando um agente atinge 10+ bloqueios DNS em 1 hora';