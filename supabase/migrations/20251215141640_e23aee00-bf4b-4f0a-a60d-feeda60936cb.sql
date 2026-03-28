-- ============================================
-- P1 CORRECTIONS: Scale & Resilience
-- ============================================

-- 1. Adicionar FK jobs ? agents com ON DELETE CASCADE
-- Isso garante que quando um agent e deletado, seus jobs sao removidos automaticamente
ALTER TABLE public.jobs
DROP CONSTRAINT IF EXISTS jobs_agent_id_fkey;

ALTER TABLE public.jobs
ADD CONSTRAINT jobs_agent_id_fkey 
FOREIGN KEY (agent_id) 
REFERENCES public.agents(id) 
ON DELETE CASCADE;

-- 2. Adicionar coluna key_hash em enrollment_keys para seguranca
-- O key original sera mantido temporariamente mas marcado para deprecacao
ALTER TABLE public.enrollment_keys
ADD COLUMN IF NOT EXISTS key_hash TEXT;

-- 3. Criar indice para busca por key_hash
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_key_hash 
ON public.enrollment_keys(key_hash) WHERE key_hash IS NOT NULL;

-- 4. Funcao para gerar hash de enrollment key
CREATE OR REPLACE FUNCTION public.hash_enrollment_key(p_key text)
RETURNS text
LANGUAGE sql
IMMUTABLE
SET search_path TO 'public'
AS $$
  SELECT encode(sha256(p_key::bytea), 'hex');
$$;

-- 5. Popular key_hash para keys existentes
UPDATE public.enrollment_keys
SET key_hash = encode(sha256(key::bytea), 'hex')
WHERE key_hash IS NULL;

-- 6. Indice para acelerar cleanup de jobs por status e data
CREATE INDEX IF NOT EXISTS idx_jobs_status_created 
ON public.jobs(status, created_at) 
WHERE status IN ('pending', 'queued', 'delivered');

-- 7. Indice para acelerar queries de metricas por agent e tempo
CREATE INDEX IF NOT EXISTS idx_metrics_partitioned_agent_time 
ON public.agent_system_metrics_partitioned(agent_id, collected_at DESC);

-- 8. Indice para jobs por agent (acelera CASCADE e queries)
CREATE INDEX IF NOT EXISTS idx_jobs_agent_id 
ON public.jobs(agent_id) WHERE agent_id IS NOT NULL;