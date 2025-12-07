-- SCALE-01 Complementar: Remover índices redundantes restantes em agent_system_metrics
-- Mantém apenas: agent_system_metrics_pkey, idx_agent_metrics_tenant_agent_collected, idx_agent_metrics_tenant_collected

DROP INDEX IF EXISTS public.idx_agent_metrics_agent_collected;
DROP INDEX IF EXISTS public.idx_agent_metrics_composite;
DROP INDEX IF EXISTS public.idx_agent_system_metrics_agent_collected;