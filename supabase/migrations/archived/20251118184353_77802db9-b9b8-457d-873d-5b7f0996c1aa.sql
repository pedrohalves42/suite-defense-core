-- PHASE 1: Garantir colunas Jobs v3 (IDEMPOTENTE)
DO $$
BEGIN
  -- Adicionar colunas se nao existirem
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'output') THEN
    ALTER TABLE public.jobs ADD COLUMN output jsonb;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'error_message') THEN
    ALTER TABLE public.jobs ADD COLUMN error_message text;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'started_at') THEN
    ALTER TABLE public.jobs ADD COLUMN started_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'finished_at') THEN
    ALTER TABLE public.jobs ADD COLUMN finished_at timestamptz;
  END IF;
  
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'jobs' AND column_name = 'execution_time_seconds') THEN
    ALTER TABLE public.jobs ADD COLUMN execution_time_seconds integer;
  END IF;
END $$;

-- PHASE 2: Recriar view normalizada (DROP + CREATE)
DROP VIEW IF EXISTS public.jobs_normalized CASCADE;

CREATE OR REPLACE VIEW public.jobs_normalized AS
SELECT
  j.id,
  j.agent_name,
  j.tenant_id,
  j.type,
  j.payload,
  j.created_at,
  j.delivered_at,
  j.scheduled_at,
  j.approved,
  j.is_recurring,
  j.recurrence_pattern,
  j.last_run_at,
  j.next_run_at,
  j.parent_job_id,
  j.status,
  -- Status normalizado (done -> completed)
  CASE 
    WHEN j.status = 'done' THEN 'completed'
    ELSE j.status
  END AS normalized_status,
  -- Flag v3 (jobs com output estruturado)
  (j.output IS NOT NULL) AS is_v3,
  -- Campos v3
  j.output,
  j.error_message,
  j.started_at,
  j.finished_at,
  j.execution_time_seconds,
  -- Campos legado
  j.completed_at,
  -- Duracao calculada
  COALESCE(
    j.execution_time_seconds,
    CASE 
      WHEN j.finished_at IS NOT NULL AND j.started_at IS NOT NULL
      THEN EXTRACT(EPOCH FROM (j.finished_at - j.started_at))::integer
      ELSE NULL
    END
  ) AS duration_seconds
FROM public.jobs j;

-- Comentarios para documentacao
COMMENT ON VIEW public.jobs_normalized IS 'View unificada Jobs v1/v3 com retrocompatibilidade. is_v3=true indica jobs com output estruturado.';
COMMENT ON COLUMN public.jobs.output IS 'JSON estruturado do resultado (v3)';
COMMENT ON COLUMN public.jobs.finished_at IS 'Timestamp de conclusao (v3, substitui completed_at)';
COMMENT ON COLUMN public.jobs.started_at IS 'Timestamp de inicio da execucao (v3)';
COMMENT ON COLUMN public.jobs.execution_time_seconds IS 'Duracao da execucao em segundos (v3)';
