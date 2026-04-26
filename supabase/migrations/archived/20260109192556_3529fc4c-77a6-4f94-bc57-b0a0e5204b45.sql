-- ADR-031: Closed-Loop Job Observability
-- Conecta o Job Engine ao Task Engine eliminando falhas silenciosas

-- ============================================
-- 1. Trigger: Job Falho ? Task
-- ============================================
CREATE OR REPLACE FUNCTION public.create_task_from_failed_job()
RETURNS TRIGGER AS $$
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
        NEW.id::text,
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS tr_create_task_from_failed_job ON public.jobs;
CREATE TRIGGER tr_create_task_from_failed_job
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.create_task_from_failed_job();

-- ============================================
-- 2. Trigger: Job Falho ? DLQ (automatico)
-- ============================================
CREATE OR REPLACE FUNCTION public.auto_insert_failed_job_to_dlq()
RETURNS TRIGGER AS $$
BEGIN
  -- So atuar quando job transita PARA failed
  IF OLD.status IS DISTINCT FROM 'failed' AND NEW.status = 'failed' THEN
    -- Inserir na DLQ se nao existir
    INSERT INTO public.failed_jobs_dlq (
      original_job_id, 
      tenant_id, 
      agent_id, 
      agent_name, 
      job_type,
      payload, 
      error_message, 
      failure_class, 
      status,
      created_at,
      last_failure_at
    )
    VALUES (
      NEW.id,
      NEW.tenant_id,
      NEW.agent_id,
      NEW.agent_name,
      NEW.type,
      NEW.payload,
      NEW.error_message,
      NEW.failure_class,
      'pending',
      NOW(),
      NOW()
    )
    ON CONFLICT (original_job_id) DO UPDATE SET
      error_count = public.failed_jobs_dlq.error_count + 1,
      last_failure_at = NOW(),
      error_message = EXCLUDED.error_message,
      failure_class = EXCLUDED.failure_class;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS tr_auto_insert_dlq ON public.jobs;
CREATE TRIGGER tr_auto_insert_dlq
  AFTER UPDATE ON public.jobs
  FOR EACH ROW
  EXECUTE FUNCTION public.auto_insert_failed_job_to_dlq();

-- ============================================
-- 3. Trigger: DLQ Item ? Task
-- ============================================
CREATE OR REPLACE FUNCTION public.create_task_from_dlq_item()
RETURNS TRIGGER AS $$
BEGIN
  -- Criar task para itens DLQ flagged como suspicious ou com muitos retries
  IF NEW.flagged_suspicious = true OR COALESCE(NEW.retry_count, 0) >= 3 THEN
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
      'dlq',
      NEW.id::text,
      '[DLQ] ' || COALESCE(NEW.job_type, 'unknown') || ': Requer Revisao Manual',
      'Item na Dead Letter Queue requer revisao manual.' ||
      E'\n\nMotivo: ' || CASE 
        WHEN NEW.flagged_suspicious THEN 'Marcado como suspeito'
        ELSE 'Excedeu limite de retries (' || COALESCE(NEW.retry_count, 0)::text || ')'
      END ||
      E'\n\nErro: ' || COALESCE(NEW.error_message, 'Sem mensagem') ||
      E'\nAgente: ' || COALESCE(NEW.agent_name, 'N/A') ||
      E'\nJob Original: ' || COALESCE(NEW.original_job_id::text, 'N/A'),
      CASE WHEN NEW.flagged_suspicious THEN 'high' ELSE 'medium' END,
      'open',
      true,
      true,
      NOW() + interval '24 hours',
      NOW(),
      NOW()
    )
    ON CONFLICT (source_type, source_id) WHERE source_type IS NOT NULL AND source_id IS NOT NULL
    DO UPDATE SET
      updated_at = NOW(),
      severity = CASE WHEN NEW.flagged_suspicious THEN 'high' ELSE public.tasks.severity END;
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS tr_create_task_from_dlq_item ON public.failed_jobs_dlq;
CREATE TRIGGER tr_create_task_from_dlq_item
  AFTER INSERT OR UPDATE ON public.failed_jobs_dlq
  FOR EACH ROW
  EXECUTE FUNCTION public.create_task_from_dlq_item();

-- ============================================
-- 4. Trigger: DLQ Resolved ? Task Resolved
-- ============================================
CREATE OR REPLACE FUNCTION public.sync_task_on_dlq_resolution()
RETURNS TRIGGER AS $$
BEGIN
  IF NEW.status = 'resolved' AND COALESCE(OLD.status, '') != 'resolved' THEN
    UPDATE public.tasks
    SET
      status = 'resolved',
      closed_at = COALESCE(NEW.resolved_at, NOW()),
      closed_by = NEW.resolved_by,
      closure_reason = COALESCE(NEW.resolution_notes, 'DLQ item resolvido'),
      updated_at = NOW()
    WHERE source_type = 'dlq'
      AND source_id = NEW.id::text
      AND status NOT IN ('resolved', 'closed');
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS tr_sync_task_on_dlq_resolution ON public.failed_jobs_dlq;
CREATE TRIGGER tr_sync_task_on_dlq_resolution
  AFTER UPDATE ON public.failed_jobs_dlq
  FOR EACH ROW
  EXECUTE FUNCTION public.sync_task_on_dlq_resolution();

-- ============================================
-- 5. Adicionar indice unico em DLQ (se nao existir)
-- ============================================
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint 
    WHERE conname = 'uq_dlq_original_job_id'
  ) THEN
    ALTER TABLE public.failed_jobs_dlq
    ADD CONSTRAINT uq_dlq_original_job_id UNIQUE (original_job_id);
  END IF;
EXCEPTION
  WHEN duplicate_object THEN NULL;
END $$;

-- ============================================
-- 6. Adicionar indices para performance
-- ============================================
CREATE INDEX IF NOT EXISTS idx_tasks_source_job ON public.tasks(source_type, source_id) WHERE source_type = 'job';
CREATE INDEX IF NOT EXISTS idx_tasks_source_dlq ON public.tasks(source_type, source_id) WHERE source_type = 'dlq';
CREATE INDEX IF NOT EXISTS idx_jobs_status_failed ON public.jobs(status, tenant_id) WHERE status = 'failed';

-- ============================================
-- 7. Comentarios para documentacao
-- ============================================
COMMENT ON FUNCTION public.create_task_from_failed_job() IS 'ADR-031: Cria task automaticamente quando job falha';
COMMENT ON FUNCTION public.auto_insert_failed_job_to_dlq() IS 'ADR-031: Insere job falho na DLQ automaticamente';
COMMENT ON FUNCTION public.create_task_from_dlq_item() IS 'ADR-031: Cria task para itens DLQ suspeitos ou com muitos retries';
COMMENT ON FUNCTION public.sync_task_on_dlq_resolution() IS 'ADR-031: Sincroniza status da task quando DLQ item e resolvido';