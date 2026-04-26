-- Fase 0: Adicionar colunas Jobs v3 e criar view de compatibilidade

-- 1. Adicionar colunas v3 se nao existirem
ALTER TABLE public.jobs
  ADD COLUMN IF NOT EXISTS output jsonb,
  ADD COLUMN IF NOT EXISTS error_message text,
  ADD COLUMN IF NOT EXISTS started_at timestamptz,
  ADD COLUMN IF NOT EXISTS finished_at timestamptz,
  ADD COLUMN IF NOT EXISTS execution_time_seconds integer;

-- 2. Criar indices para performance
CREATE INDEX IF NOT EXISTS idx_jobs_status_output 
  ON public.jobs(status) 
  WHERE output IS NOT NULL;

CREATE INDEX IF NOT EXISTS idx_jobs_finished_at 
  ON public.jobs(finished_at DESC) 
  WHERE finished_at IS NOT NULL;

-- 3. Comentarios para documentacao
COMMENT ON COLUMN public.jobs.output IS 'Jobs v3: Resultado estruturado da execucao em JSON';
COMMENT ON COLUMN public.jobs.error_message IS 'Jobs v3: Mensagem de erro se status=failed';
COMMENT ON COLUMN public.jobs.execution_time_seconds IS 'Jobs v3: Tempo de execucao em segundos';
COMMENT ON COLUMN public.jobs.started_at IS 'Jobs v3: Timestamp de inicio da execucao';
COMMENT ON COLUMN public.jobs.finished_at IS 'Jobs v3: Timestamp de conclusao da execucao';

-- 4. Criar view de compatibilidade v1/v3
CREATE OR REPLACE VIEW public.jobs_normalized AS
SELECT
  j.*,
  -- Normalizar status: done (v1) ? completed (v3)
  CASE 
    WHEN j.status = 'done' THEN 'completed'
    WHEN j.status = 'failed' THEN 'failed'
    WHEN j.status = 'running' THEN 'running'
    WHEN j.status = 'queued' THEN 'queued'
    WHEN j.status = 'delivered' THEN 'running'
    ELSE j.status
  END AS normalized_status,
  
  -- Flag indicando se e v3 (tem output estruturado)
  (j.output IS NOT NULL) AS is_v3,
  
  -- Duracao calculada se nao tiver execution_time_seconds
  COALESCE(
    j.execution_time_seconds,
    CASE 
      WHEN j.finished_at IS NOT NULL AND j.started_at IS NOT NULL 
      THEN EXTRACT(EPOCH FROM (j.finished_at - j.started_at))::INTEGER
      ELSE NULL
    END
  ) AS duration_seconds

FROM public.jobs j;

COMMENT ON VIEW public.jobs_normalized IS 
  'View de compatibilidade entre Jobs v1 (ack-job, status=done) e Jobs v3 (submit-job-result, status=completed/failed). Use normalized_status para queries universais.';

-- 5. Grant access para roles existentes
GRANT SELECT ON public.jobs_normalized TO authenticated;
GRANT SELECT ON public.jobs_normalized TO anon;