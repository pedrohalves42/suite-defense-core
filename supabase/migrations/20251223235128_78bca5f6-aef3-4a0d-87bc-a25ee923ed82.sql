-- FASE 1 & 2: Job Hardening - delivery_attempts + expires_at

-- Adicionar coluna delivery_attempts para limitar retentativas
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS delivery_attempts INTEGER NOT NULL DEFAULT 0;

-- Adicionar coluna expires_at com TTL de 7 dias por padrao
ALTER TABLE public.jobs 
ADD COLUMN IF NOT EXISTS expires_at TIMESTAMPTZ DEFAULT (NOW() + INTERVAL '7 days');

-- Atualizar jobs existentes sem expires_at
UPDATE public.jobs 
SET expires_at = created_at + INTERVAL '7 days'
WHERE expires_at IS NULL;

-- Criar indice para queries de cleanup eficientes
CREATE INDEX IF NOT EXISTS idx_jobs_expires_at ON public.jobs(expires_at) 
WHERE status IN ('queued', 'delivered');

CREATE INDEX IF NOT EXISTS idx_jobs_delivery_attempts ON public.jobs(delivery_attempts) 
WHERE status = 'delivered';

-- Comentarios para documentacao
COMMENT ON COLUMN public.jobs.delivery_attempts IS 'Number of times job was delivered but not completed. Max 5 before auto-fail.';
COMMENT ON COLUMN public.jobs.expires_at IS 'Job expiration time. Jobs past this time are auto-failed. Default: created_at + 7 days.';