-- Adicionar colunas para suportar resultados detalhados de jobs
-- Compatível com agentes Linux/macOS v3 que usam submit-job-result

ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS output jsonb,
ADD COLUMN IF NOT EXISTS error_message text,
ADD COLUMN IF NOT EXISTS started_at timestamptz,
ADD COLUMN IF NOT EXISTS finished_at timestamptz,
ADD COLUMN IF NOT EXISTS execution_time_seconds integer;

-- Criar índices para performance
CREATE INDEX IF NOT EXISTS idx_jobs_status_completed 
ON public.jobs(status, completed_at) 
WHERE status = 'done';

CREATE INDEX IF NOT EXISTS idx_jobs_error 
ON public.jobs(tenant_id, status) 
WHERE error_message IS NOT NULL;

-- Comentários para documentação
COMMENT ON COLUMN public.jobs.output IS 'JSON com resultado da execução do job (stdout, dados coletados, etc)';
COMMENT ON COLUMN public.jobs.error_message IS 'Mensagem de erro caso o job falhe';
COMMENT ON COLUMN public.jobs.started_at IS 'Timestamp de quando o agente iniciou a execução';
COMMENT ON COLUMN public.jobs.finished_at IS 'Timestamp de quando o agente finalizou a execução';
COMMENT ON COLUMN public.jobs.execution_time_seconds IS 'Tempo de execução em segundos';
