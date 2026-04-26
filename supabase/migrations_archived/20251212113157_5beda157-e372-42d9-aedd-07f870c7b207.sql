-- P2-01: Corrigir indices duplicados
-- O problema e que idx_metrics_partitioned_* existe no nivel da tabela pai
-- e propaga para particoes. Os _idx1 sao automaticos.
-- Solucao: remover indice pai duplicado e manter apenas um

-- Verificar e remover indice pai duplicado se existir
DROP INDEX IF EXISTS public.idx_metrics_partitioned_agent_collected;
DROP INDEX IF EXISTS public.idx_metrics_partitioned_tenant_collected;

-- Nota: Os indices das particoes serao limpos automaticamente
-- quando os indices pai forem removidos