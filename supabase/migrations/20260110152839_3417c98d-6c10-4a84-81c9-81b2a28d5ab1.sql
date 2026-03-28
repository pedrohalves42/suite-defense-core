-- =====================================================
-- ADR-037: Job Engine Correction - Phase 0 & Phase 1
-- =====================================================

-- PRIMEIRO: Corrigir a funcao create_task_from_failed_job (source_id e uuid, nao text)
CREATE OR REPLACE FUNCTION create_task_from_failed_job()
RETURNS trigger AS $$
DECLARE
  sla_hours int;
  severity_level text;
  task_title text;
BEGIN
  -- So atuar quando job transita PARA failed
  IF OLD.status IS DISTINCT FROM 'failed' AND NEW.status = 'failed' THEN
    
    -- Mapear failure_class para severity
    severity_level := CASE NEW.failure_class
      WHEN 'BUG' THEN 'critical'
      WHEN 'AGENT_STALLED' THEN 'high'
      WHEN 'AGENT_OFFLINE' THEN 'medium'
      WHEN 'CASCADE_FAILURE' THEN 'high'
      WHEN 'TIMEOUT' THEN 'medium'
      ELSE 'low'
    END;
    
    -- SLA baseado em severity
    sla_hours := CASE severity_level
      WHEN 'critical' THEN 4
      WHEN 'high' THEN 24
      WHEN 'medium' THEN 48
      ELSE 72
    END;
    
    -- Titulo descritivo
    task_title := '[Job Falho] ' || COALESCE(NEW.type, 'unknown') || ': ' || COALESCE(NEW.failure_class, 'UNKNOWN');
    
    -- Criar task apenas para falhas nao-esperadas
    IF COALESCE(NEW.failure_class, '') NOT IN ('EXPECTED_DROP', 'TRANSIENT') THEN
      INSERT INTO public.tasks (
        tenant_id, 
        source_type, 
        source_id, 
        title, 
        description, 
        severity, 
        status, 
        requires_human_review, 
        auto_generated, 
        due_at,
        created_at,
        updated_at
      )
      VALUES (
        NEW.tenant_id,
        'job',
        NEW.id,  -- Ja e UUID, nao precisa de cast
        task_title,
        'Job falhou: ' || COALESCE(NEW.error_message, 'Sem mensagem de erro') || 
        E'\n\nAgente: ' || COALESCE(NEW.agent_name, 'N/A') ||
        E'\nTipo: ' || COALESCE(NEW.type, 'N/A') ||
        E'\nClasse de Falha: ' || COALESCE(NEW.failure_class, 'N/A'),
        severity_level,
        'open',
        NEW.failure_class IN ('BUG', 'CASCADE_FAILURE'),
        true,
        NOW() + (sla_hours || ' hours')::interval,
        NOW(),
        NOW()
      )
      ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
      DO UPDATE SET
        updated_at = NOW(),
        description = EXCLUDED.description;
    END IF;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- SEGUNDO: Corrigir a funcao audit_dlq_operations para pular audit quando nao ha user
CREATE OR REPLACE FUNCTION audit_dlq_operations()
RETURNS trigger AS $$
BEGIN
  IF TG_OP = 'DELETE' THEN
    IF OLD.resolved_by IS NULL THEN
      RAISE EXCEPTION 'DLQ_SECURITY: Cannot delete unreviewed DLQ item. Review required before disposal.'
        USING ERRCODE = '23514';
    END IF;
    IF auth.uid() IS NOT NULL THEN
      INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, success)
      VALUES (
        OLD.tenant_id, auth.uid(), 'dlq_item_deleted', 'failed_jobs_dlq', OLD.id::text,
        jsonb_build_object('job_type', OLD.job_type, 'risk_category', OLD.risk_category), true
      );
    END IF;
    RETURN OLD;
  ELSIF TG_OP = 'UPDATE' THEN
    IF NEW.resolved_by IS NOT NULL AND OLD.resolved_by IS NULL THEN
      IF auth.uid() IS NOT NULL THEN
        INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, success)
        VALUES (
          NEW.tenant_id, auth.uid(), 'dlq_item_reviewed', 'failed_jobs_dlq', NEW.id::text,
          jsonb_build_object('resolved_by', NEW.resolved_by, 'review_notes', NEW.review_notes, 'risk_category', NEW.risk_category), true
        );
      END IF;
    END IF;
    RETURN NEW;
  ELSIF TG_OP = 'INSERT' THEN
    -- Skip audit log for system-generated inserts (no authenticated user)
    IF auth.uid() IS NOT NULL THEN
      INSERT INTO audit_logs (tenant_id, user_id, action, resource_type, resource_id, details, success)
      VALUES (
        NEW.tenant_id, auth.uid(),
        'dlq_item_created', 'failed_jobs_dlq', NEW.id::text,
        jsonb_build_object('job_type', NEW.job_type, 'error_message', NEW.error_message), true
      );
    END IF;
    RETURN NEW;
  END IF;
  RETURN NULL;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- TERCEIRO: Corrigir a funcao sanitize_dlq_payload usando extensions.digest
CREATE OR REPLACE FUNCTION sanitize_dlq_payload()
RETURNS trigger AS $$
BEGIN
  -- Generate SHA-256 hash of payload
  IF NEW.payload IS NOT NULL AND NEW.payload_hash IS NULL THEN
    NEW.payload_hash := encode(extensions.digest(NEW.payload::text::bytea, 'sha256'), 'hex');
    NEW.payload_schema := jsonb_typeof(NEW.payload)::text;
    
    -- Risk classification based on suspicious patterns
    NEW.risk_category := COALESCE(NEW.risk_category,
      CASE
        WHEN NEW.payload::text ~* '(drop\s+table|delete\s+from|truncate|<script|javascript:|eval\(|exec\s*\()' THEN 'critical'
        WHEN NEW.payload::text ~* '(select\s+.*\s+from|insert\s+into|update\s+.*\s+set|curl\s|wget\s)' THEN 'high'
        WHEN NEW.payload::text ~* '(password|secret|token|api_key|private_key)' THEN 'medium'
        ELSE 'low'
      END
    );
    
    -- Safe excerpt (max 256 chars, alphanumeric only)
    NEW.payload_excerpt := left(
      regexp_replace(NEW.payload::text, '[^a-zA-Z0-9 _.,:\-]', '', 'g'), 
      256
    );
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- QUARTO: Atualizar o trigger de transicoes para incluir 'pending'
CREATE OR REPLACE FUNCTION enforce_job_state_transitions()
RETURNS trigger AS $$
DECLARE
  v_valid_transitions jsonb := '{
    "pending": ["queued", "cancelled", "failed"],
    "queued": ["delivered", "failed", "cancelled"],
    "delivered": ["completed", "failed", "cancelled"],
    "completed": [],
    "failed": [],
    "cancelled": []
  }'::jsonb;
  v_allowed_states jsonb;
BEGIN
  -- Se status nao mudou, permitir
  IF OLD.status = NEW.status THEN
    RETURN NEW;
  END IF;
  
  -- Buscar transicoes validas para o estado atual
  v_allowed_states := v_valid_transitions->OLD.status;
  
  -- Verificar se o novo estado esta na lista de permitidos
  IF v_allowed_states IS NULL OR NOT v_allowed_states ? NEW.status THEN
    RAISE EXCEPTION 'ILLEGAL_STATE_TRANSITION: Cannot transition from % to %. Allowed transitions from %: %',
      OLD.status,
      NEW.status,
      OLD.status,
      COALESCE(v_allowed_states, '[]'::jsonb)
    USING ERRCODE = '23514'; -- check_violation
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- FASE 0: CORRECAO DE DADOS
-- =====================================================

-- 1. Cancelar jobs pending orfaos (>24h)
UPDATE jobs
SET status = 'cancelled',
    completed_at = now(),
    error_message = '[AUDIT-037] Auto-cancelled: pending job exceeded 24h timeout'
WHERE status = 'pending'
  AND created_at < now() - interval '24 hours';

-- 2. Backfill completed_at para jobs terminais
UPDATE jobs 
SET completed_at = COALESCE(finished_at, started_at, created_at)
WHERE status IN ('failed', 'completed', 'cancelled')
  AND completed_at IS NULL;

-- 3. Cleanup zombies delivered >2h
UPDATE jobs
SET status = 'failed',
    completed_at = now(),
    error_message = '[AUDIT-037] Auto-failed: delivered job exceeded 2h timeout',
    failure_class = 'AGENT_STALLED'
WHERE status = 'delivered'
  AND delivered_at < now() - interval '2 hours';

-- 4. Backfill DLQ com classificacao causal
INSERT INTO failed_jobs_dlq (
  original_job_id, tenant_id, agent_id, agent_name, 
  job_type, payload, error_message, failure_class, status
)
SELECT 
  j.id, j.tenant_id, j.agent_id, j.agent_name,
  j.type, j.payload, 
  COALESCE(j.error_message, '[AUDIT-037] Historical failure without DLQ entry'),
  CASE
    WHEN j.delivered_at IS NOT NULL THEN 'AGENT_EXECUTION'
    WHEN j.delivered_at IS NULL THEN 'DISPATCH_FAILURE'
    ELSE 'UNKNOWN'
  END,
  'pending'
FROM jobs j
LEFT JOIN failed_jobs_dlq dlq ON dlq.original_job_id = j.id
WHERE j.status = 'failed' AND dlq.id IS NULL
ON CONFLICT (original_job_id) DO NOTHING;

-- 5. Desativar enrollment keys expiradas
UPDATE enrollment_keys
SET is_active = false
WHERE expires_at < NOW()
  AND is_active = true;

-- FASE 1: PREVENCAO
-- =====================================================

-- 1. Funcao para garantir completed_at em estados terminais
CREATE OR REPLACE FUNCTION ensure_completed_at_on_terminal()
RETURNS trigger AS $$
BEGIN
  -- INSERT: se ja nasce terminal, garantir completed_at
  IF TG_OP = 'INSERT' 
     AND NEW.status IN ('completed', 'failed', 'cancelled') 
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  
  -- UPDATE: so se status MUDOU para terminal
  IF TG_OP = 'UPDATE'
     AND NEW.status IS DISTINCT FROM OLD.status
     AND NEW.status IN ('completed', 'failed', 'cancelled')
     AND NEW.completed_at IS NULL THEN
    NEW.completed_at := now();
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Remover trigger existente se houver
DROP TRIGGER IF EXISTS tr_ensure_completed_at ON jobs;

-- Criar trigger
CREATE TRIGGER tr_ensure_completed_at
BEFORE INSERT OR UPDATE ON jobs
FOR EACH ROW
EXECUTE FUNCTION ensure_completed_at_on_terminal();

-- 2. Funcao de cleanup automatico de jobs stuck
CREATE OR REPLACE FUNCTION cleanup_stuck_pending_jobs()
RETURNS integer AS $$
DECLARE
  v_count integer := 0;
BEGIN
  UPDATE jobs
  SET status = 'cancelled',
      completed_at = now(),
      error_message = '[AUTO] Cancelled: pending job exceeded 24h TTL'
  WHERE status = 'pending'
    AND created_at < now() - interval '24 hours';
  GET DIAGNOSTICS v_count = ROW_COUNT;
  RETURN v_count;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public';

-- 3. View de Health Anomalies para monitoramento continuo
CREATE OR REPLACE VIEW v_job_health_anomalies AS
SELECT 
  'pending_approved' as anomaly_type,
  COUNT(*) as count,
  MIN(created_at) as oldest
FROM jobs
WHERE status = 'pending' AND approved = true
UNION ALL
SELECT 
  'terminal_no_completed_at',
  COUNT(*),
  MIN(created_at)
FROM jobs
WHERE status IN ('failed', 'completed', 'cancelled') 
  AND completed_at IS NULL
UNION ALL
SELECT 
  'failed_no_dlq',
  COUNT(*),
  MIN(j.created_at)
FROM jobs j
LEFT JOIN failed_jobs_dlq dlq ON dlq.original_job_id = j.id
WHERE j.status = 'failed' AND dlq.id IS NULL
UNION ALL
SELECT
  'zombie_delivered',
  COUNT(*),
  MIN(delivered_at)
FROM jobs
WHERE status = 'delivered'
  AND delivered_at < now() - interval '2 hours'
UNION ALL
SELECT
  'expired_active_keys',
  COUNT(*),
  MIN(expires_at)
FROM enrollment_keys
WHERE expires_at < NOW() AND is_active = true;