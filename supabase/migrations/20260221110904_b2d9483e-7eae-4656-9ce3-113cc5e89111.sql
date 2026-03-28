
-- Etapa 3 - Remocao segura das 6 tabelas orfas aprovadas
-- Nenhuma possui FKs apontando para elas e nenhuma e referenciada no codigo

-- 1. Particoes expiradas/vazias de metricas
DROP TABLE IF EXISTS public.agent_system_metrics_2025_12 CASCADE;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_01 CASCADE;
DROP TABLE IF EXISTS public.agent_system_metrics_2026_03 CASCADE;

-- 2. Tabela pai obsoleta (substituida por agent_system_metrics_partitioned)
DROP TABLE IF EXISTS public.agent_system_metrics CASCADE;

-- 3. Tabela de auditoria orfa sem uso
DROP TABLE IF EXISTS public._audit_orphan_profiles CASCADE;

-- 4. Tabela de liveness sem referencia no codigo
DROP TABLE IF EXISTS public.system_liveness CASCADE;
