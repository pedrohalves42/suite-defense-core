-- P2-02: Otimização de índices da tabela jobs

-- 1. Índice para consultas por tipo de job (relatórios)
CREATE INDEX IF NOT EXISTS idx_jobs_type_created 
ON public.jobs(type, created_at DESC);

-- 2. Índice para jobs queued (substituindo pending)
DROP INDEX IF EXISTS idx_jobs_pending;
CREATE INDEX IF NOT EXISTS idx_jobs_queued 
ON public.jobs(agent_name, created_at DESC) WHERE status = 'queued';

-- 3. Índice para cleanup de jobs antigos
CREATE INDEX IF NOT EXISTS idx_jobs_cleanup 
ON public.jobs(created_at) WHERE status IN ('completed', 'failed');

-- 4. Índice composto para consultas por tenant e status
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status 
ON public.jobs(tenant_id, status, created_at DESC);

-- 5. Comentários documentando os índices
COMMENT ON INDEX idx_jobs_type_created IS 'P2-02: Otimiza relatórios por tipo de job';
COMMENT ON INDEX idx_jobs_queued IS 'P2-02: Otimiza poll de jobs pendentes para agentes';
COMMENT ON INDEX idx_jobs_cleanup IS 'P2-02: Otimiza cleanup de jobs antigos';
COMMENT ON INDEX idx_jobs_tenant_status IS 'P2-02: Otimiza consultas por tenant e status';