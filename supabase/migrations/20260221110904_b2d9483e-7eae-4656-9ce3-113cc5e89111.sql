
-- Etapa 3 - Remoção segura das 6 tabelas órfãs aprovadas
-- Nenhuma possui FKs apontando para elas e nenhuma é referenciada no código

-- 1. Partições expiradas/vazias de métricas
DROP TABLE IF EXISTS public.agent_system_metrics_2025_12 CASCADE;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_01 CASCADE;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_03 CASCADE;

-- 2. Tabela pai obsoleta (substituída por agent_system_metrics_partitioned)
DROP TABLE IF EXISTS public.agent_system_metrics CASCADE;

-- 3. Tabela de auditoria órfã sem uso
DROP TABLE IF EXISTS public._audit_orphan_profiles CASCADE;

-- 4. Tabela de liveness sem referência no código
DROP TABLE IF EXISTS public.system_liveness CASCADE;
