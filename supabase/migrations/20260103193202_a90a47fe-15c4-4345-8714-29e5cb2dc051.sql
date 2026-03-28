-- =====================================================
-- PASSO 1: Aprovacao Humana REAL para AI Actions (+20 pts)
-- =====================================================

-- Adicionar campos de aprovacao formal a ai_actions
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS approved_at timestamptz;
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS approved_by uuid REFERENCES auth.users(id);
ALTER TABLE ai_actions ADD COLUMN IF NOT EXISTS approval_request_id uuid REFERENCES approval_requests(id);

-- Trigger: Enforcement de aprovacao para acoes high/critical
CREATE OR REPLACE FUNCTION public.enforce_ai_action_approval()
RETURNS TRIGGER AS $$
BEGIN
  -- Se status mudou para 'executed' e risk_level e high/critical
  IF NEW.status = 'executed' AND (OLD.status IS NULL OR OLD.status != 'executed') THEN
    IF NEW.risk_level IN ('high', 'critical') AND NEW.approved_at IS NULL THEN
      RAISE EXCEPTION 'AI actions with high/critical risk require formal approval before execution (approved_at must be set)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_ai_action_approval ON ai_actions;
CREATE TRIGGER trg_enforce_ai_action_approval
  BEFORE UPDATE ON ai_actions
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_ai_action_approval();

-- =====================================================
-- PASSO 2: Gate Humano para Alertas Criticos (+15 pts)
-- =====================================================

-- Adicionar campos para alertas criticos
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS requires_human_decision boolean DEFAULT false;
ALTER TABLE system_alerts ADD COLUMN IF NOT EXISTS decision_event_id uuid REFERENCES decision_events(id);

-- Trigger para auto-flag alertas criticos
CREATE OR REPLACE FUNCTION public.flag_critical_alerts()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.severity = 'critical' THEN
    NEW.requires_human_decision := true;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_flag_critical_alerts ON system_alerts;
CREATE TRIGGER trg_flag_critical_alerts
  BEFORE INSERT ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.flag_critical_alerts();

-- Enforcement: alertas criticos nao podem ser resolvidos sem humano
CREATE OR REPLACE FUNCTION public.enforce_critical_alert_human_review()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.resolved = true AND (OLD.resolved IS NULL OR OLD.resolved = false) THEN
    IF NEW.severity = 'critical' AND NEW.resolved_by IS NULL THEN
      RAISE EXCEPTION 'Critical alerts require human resolution (resolved_by must be set)';
    END IF;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_enforce_critical_human_review ON system_alerts;
CREATE TRIGGER trg_enforce_critical_human_review
  BEFORE UPDATE ON system_alerts
  FOR EACH ROW
  EXECUTE FUNCTION public.enforce_critical_alert_human_review();

-- =====================================================
-- PASSO 3: DLQ Auditavel com Trilha de Decisao (+10 pts)
-- =====================================================

-- Adicionar campos para trilha de decisao na DLQ
ALTER TABLE failed_jobs_dlq ADD COLUMN IF NOT EXISTS decision_event_id uuid REFERENCES decision_events(id);
ALTER TABLE failed_jobs_dlq ADD COLUMN IF NOT EXISTS resolution_source text CHECK (resolution_source IS NULL OR resolution_source IN ('human', 'system', 'auto_cleanup'));

-- Trigger para criar decision_event ao resolver DLQ
CREATE OR REPLACE FUNCTION public.create_dlq_decision_event()
RETURNS TRIGGER AS $$
DECLARE
  v_event_id uuid;
  v_tenant_id uuid;
BEGIN
  IF NEW.status = 'resolved' AND (OLD.status IS NULL OR OLD.status != 'resolved') THEN
    -- Buscar tenant_id do job original se nao existir na DLQ
    v_tenant_id := NEW.tenant_id;
    
    -- Criar decision_event para rastreabilidade
    INSERT INTO decision_events (
      tenant_id, 
      rule_code, 
      action, 
      evidence, 
      decision_source, 
      decision_type
    ) VALUES (
      v_tenant_id,
      'DLQ_RESOLUTION',
      'resolve_dlq_item',
      jsonb_build_object(
        'dlq_item_id', NEW.id,
        'original_job_id', NEW.original_job_id,
        'job_type', NEW.job_type,
        'error_message', NEW.error_message,
        'resolution_notes', NEW.resolution_notes,
        'resolved_by', NEW.resolved_by
      ),
      COALESCE(NEW.resolution_source, CASE WHEN NEW.resolved_by IS NOT NULL THEN 'human' ELSE 'system' END),
      'dlq_resolution'
    ) RETURNING id INTO v_event_id;
    
    NEW.decision_event_id := v_event_id;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_create_dlq_decision_event ON failed_jobs_dlq;
CREATE TRIGGER trg_create_dlq_decision_event
  BEFORE UPDATE ON failed_jobs_dlq
  FOR EACH ROW
  EXECUTE FUNCTION public.create_dlq_decision_event();

-- View para monitorar DLQ antiga sem resolucao (alertas pendentes)
CREATE OR REPLACE VIEW public.v_dlq_pending_attention AS
SELECT 
  d.*,
  EXTRACT(EPOCH FROM (NOW() - d.created_at))/3600 as hours_pending
FROM failed_jobs_dlq d
WHERE d.status = 'pending' 
  AND d.created_at < NOW() - INTERVAL '1 hour'
  AND d.review_required = true;

-- =====================================================
-- Indices para performance
-- =====================================================
CREATE INDEX IF NOT EXISTS idx_ai_actions_approved_at ON ai_actions(approved_at) WHERE approved_at IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_system_alerts_requires_human ON system_alerts(requires_human_decision) WHERE requires_human_decision = true;
CREATE INDEX IF NOT EXISTS idx_dlq_decision_event ON failed_jobs_dlq(decision_event_id) WHERE decision_event_id IS NOT NULL;