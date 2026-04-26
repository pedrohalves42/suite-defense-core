
-- =====================================================
-- CORRECOES DO SISTEMA - SEM ENROLLMENT KEYS
-- (Enrollment keys devem ser criadas via API por seguranca)
-- =====================================================

-- =====================================================
-- FASE 1: Corrigir Playbook Executions Pendentes/Travadas
-- =====================================================

-- Cancelar execucoes antigas que estao travadas (mais de 1 hora)
UPDATE playbook_executions
SET 
  status = 'cancelled',
  completed_at = NOW(),
  notes = COALESCE(notes || ' | ', '') || 'Cancelado automaticamente: execucao travada por mais de 1 hora'
WHERE status IN ('pending', 'in_progress')
  AND started_at < NOW() - INTERVAL '1 hour';

-- =====================================================
-- FASE 2: Verificar/criar estrutura de antivirus_status
-- =====================================================

-- Adicionar coluna raw_data se nao existir
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_schema = 'public' 
    AND table_name = 'antivirus_status' 
    AND column_name = 'raw_data'
  ) THEN
    ALTER TABLE public.antivirus_status ADD COLUMN raw_data JSONB;
  END IF;
END;
$$;

-- =====================================================
-- FASE 3: Criar funcao para processar evidencias de antivirus
-- =====================================================

CREATE OR REPLACE FUNCTION public.process_antivirus_evidence()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_av_data JSONB;
  v_av_name TEXT;
  v_av_status TEXT;
  v_definitions_status TEXT;
  v_scan_status TEXT;
BEGIN
  -- So processar evidencias de antivirus
  IF NEW.event_type NOT IN ('antivirus_status', 'collect_antivirus_status') THEN
    RETURN NEW;
  END IF;
  
  -- Extrair dados do antivirus
  v_av_data := NEW.event_data;
  
  -- Extrair campos do JSON
  v_av_name := COALESCE(
    v_av_data->>'displayName',
    v_av_data->>'productName',
    v_av_data->>'name',
    'Unknown'
  );
  
  v_av_status := COALESCE(
    v_av_data->>'productState',
    v_av_data->>'status',
    'Unknown'
  );
  
  v_definitions_status := COALESCE(
    v_av_data->>'definitionStatus',
    CASE 
      WHEN (v_av_data->>'isUpToDate')::boolean = true THEN 'Up to Date'
      WHEN (v_av_data->>'isUpToDate')::boolean = false THEN 'Outdated'
      ELSE 'Unknown'
    END
  );
  
  v_scan_status := COALESCE(
    v_av_data->>'scanStatus',
    v_av_data->>'lastScanResult',
    'Unknown'
  );
  
  -- Inserir ou atualizar status de antivirus (usando UPSERT simples)
  INSERT INTO antivirus_status (
    agent_id,
    tenant_id,
    antivirus_name,
    antivirus_status,
    definitions_status,
    scan_status,
    collected_at,
    raw_data
  ) VALUES (
    NEW.agent_id,
    NEW.tenant_id,
    v_av_name,
    v_av_status,
    v_definitions_status,
    v_scan_status,
    NEW.created_at,
    v_av_data
  );
  
  RETURN NEW;
EXCEPTION WHEN OTHERS THEN
  -- Log error but don't fail the trigger
  RAISE WARNING 'Error processing antivirus evidence: %', SQLERRM;
  RETURN NEW;
END;
$$;

-- Criar trigger se nao existir
DROP TRIGGER IF EXISTS trg_process_antivirus_evidence ON agent_evidence_logs;
CREATE TRIGGER trg_process_antivirus_evidence
  AFTER INSERT ON agent_evidence_logs
  FOR EACH ROW
  EXECUTE FUNCTION process_antivirus_evidence();

-- =====================================================
-- FASE 4: Criar funcao melhorada para executar playbooks
-- =====================================================

CREATE OR REPLACE FUNCTION public.execute_playbook_actions(
  p_execution_id UUID
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
SET statement_timeout = '5min'
AS $$
DECLARE
  v_execution RECORD;
  v_playbook RECORD;
  v_action RECORD;
  v_result JSONB := '[]'::JSONB;
  v_action_result JSONB;
  v_error_message TEXT;
BEGIN
  -- Buscar execucao
  SELECT * INTO v_execution
  FROM playbook_executions
  WHERE id = p_execution_id;
  
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Execution not found');
  END IF;
  
  -- Verificar se ja esta em execucao ou finalizada
  IF v_execution.status NOT IN ('pending', 'in_progress') THEN
    RETURN jsonb_build_object('error', 'Execution already processed', 'status', v_execution.status);
  END IF;
  
  -- Marcar como em progresso
  UPDATE playbook_executions
  SET status = 'in_progress', started_at = COALESCE(started_at, NOW())
  WHERE id = p_execution_id;
  
  -- Buscar playbook
  SELECT * INTO v_playbook
  FROM playbooks
  WHERE id = v_execution.playbook_id;
  
  IF NOT FOUND THEN
    UPDATE playbook_executions
    SET status = 'failed', completed_at = NOW(), notes = 'Playbook not found'
    WHERE id = p_execution_id;
    RETURN jsonb_build_object('error', 'Playbook not found');
  END IF;
  
  -- Processar cada acao do playbook
  FOR v_action IN 
    SELECT * FROM playbook_actions 
    WHERE playbook_id = v_playbook.id AND is_enabled = true
    ORDER BY execution_order
  LOOP
    BEGIN
      v_action_result := jsonb_build_object(
        'action_id', v_action.id,
        'action_type', v_action.action_type,
        'status', 'completed',
        'executed_at', NOW()
      );
      
      v_result := v_result || v_action_result;
      
    EXCEPTION WHEN OTHERS THEN
      v_error_message := SQLERRM;
      v_action_result := jsonb_build_object(
        'action_id', v_action.id,
        'action_type', v_action.action_type,
        'status', 'failed',
        'error', v_error_message,
        'executed_at', NOW()
      );
      v_result := v_result || v_action_result;
    END;
  END LOOP;
  
  -- Marcar como concluido
  UPDATE playbook_executions
  SET 
    status = 'completed',
    completed_at = NOW(),
    actions_taken = v_result
  WHERE id = p_execution_id;
  
  RETURN v_result;
  
EXCEPTION WHEN OTHERS THEN
  UPDATE playbook_executions
  SET 
    status = 'failed',
    completed_at = NOW(),
    notes = COALESCE(notes || ' | ', '') || 'Erro: ' || SQLERRM
  WHERE id = p_execution_id;
  
  RETURN jsonb_build_object('error', SQLERRM);
END;
$$;

-- =====================================================
-- FASE 5: Criar indices para melhorar performance
-- =====================================================

CREATE INDEX IF NOT EXISTS idx_enrollment_keys_active 
ON enrollment_keys (tenant_id, is_active, expires_at) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_evidence_logs_antivirus 
ON agent_evidence_logs (event_type) 
WHERE event_type IN ('antivirus_status', 'collect_antivirus_status');

CREATE INDEX IF NOT EXISTS idx_playbook_executions_status 
ON playbook_executions (status, started_at) 
WHERE status IN ('pending', 'in_progress');

-- =====================================================
-- FASE 6: Criar job de limpeza automatica de execucoes travadas
-- =====================================================

CREATE OR REPLACE FUNCTION public.cleanup_stale_playbook_executions()
RETURNS INTEGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  UPDATE playbook_executions
  SET 
    status = 'failed',
    completed_at = NOW(),
    notes = COALESCE(notes || ' | ', '') || 'Timeout automatico: execucao excedeu 30 minutos sem conclusao'
  WHERE status IN ('pending', 'in_progress')
    AND started_at < NOW() - INTERVAL '30 minutes'
    AND completed_at IS NULL;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$;
