-- Correções de segurança e otimizações

-- 1. Criar índice para otimizar queries de enrollment_keys
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_created_by ON public.enrollment_keys(created_by);

-- 2. Criar índice para otimizar queries de jobs
CREATE INDEX IF NOT EXISTS idx_jobs_agent_status ON public.jobs(agent_name, status);
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_created ON public.jobs(tenant_id, created_at DESC);

-- 3. Criar índice para otimizar queries de agents
CREATE INDEX IF NOT EXISTS idx_agents_tenant_status ON public.agents(tenant_id, status);
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat ON public.agents(last_heartbeat DESC);

-- 4. Adicionar comentários de documentação
COMMENT ON TABLE public.agents IS 'Tabela de agentes registrados no sistema. Cada agente representa uma instalação Windows/Linux.';
COMMENT ON TABLE public.jobs IS 'Tabela de jobs pendentes e executados. Jobs são tarefas enviadas aos agentes.';
COMMENT ON TABLE public.agent_tokens IS 'Tokens de autenticação para agents. Um agente pode ter múltiplos tokens.';
COMMENT ON TABLE public.enrollment_keys IS 'Chaves temporárias para enrollment de novos agentes.';
COMMENT ON TABLE public.hmac_signatures IS 'Histórico de HMAC signatures usadas para prevenir replay attacks.';
COMMENT ON TABLE public.rate_limits IS 'Controle de rate limiting por endpoint e identificador.';

-- 5. Comentários nas colunas críticas
COMMENT ON COLUMN public.agents.last_heartbeat IS 'Timestamp do último heartbeat recebido. Usado para determinar status online/offline.';
COMMENT ON COLUMN public.agents.hmac_secret IS 'Secret HMAC para validação de autenticidade das requisições do agente.';
COMMENT ON COLUMN public.jobs.status IS 'Status: queued (aguardando), delivered (em execução), done (concluído), failed (falhou)';
COMMENT ON COLUMN public.enrollment_keys.is_active IS 'False se revogada ou expirada. True se ainda pode ser usada.';
