-- P2-02: Otimizacao de indices da tabela jobs

-- 1. Indice para consultas por tipo de job (relatorios)
CREATE INDEX IF NOT EXISTS idx_jobs_type_created 
ON public.jobs(type, created_at DESC);

-- 2. Indice para jobs queued (substituindo pending)
DROP INDEX IF EXISTS idx_jobs_pending;
CREATE INDEX IF NOT EXISTS idx_jobs_queued 
ON public.jobs(agent_name, created_at DESC) WHERE status = 'queued';

-- 3. Indice para cleanup de jobs antigos
CREATE INDEX IF NOT EXISTS idx_jobs_cleanup 
ON public.jobs(created_at) WHERE status IN ('completed', 'failed');

-- 4. Indice composto para consultas por tenant e status
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status 
ON public.jobs(tenant_id, status, created_at DESC);

-- 5. Comentarios documentando os indices
COMMENT ON INDEX idx_jobs_type_created IS 'P2-02: Otimiza relatorios por tipo de job';
COMMENT ON INDEX idx_jobs_queued IS 'P2-02: Otimiza poll de jobs pendentes para agentes';
COMMENT ON INDEX idx_jobs_cleanup IS 'P2-02: Otimiza cleanup de jobs antigos';
COMMENT ON INDEX idx_jobs_tenant_status IS 'P2-02: Otimiza consultas por tenant e status';