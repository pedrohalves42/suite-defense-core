-- P2-01: Corrigir índices duplicados
-- O problema é que idx_metrics_partitioned_* existe no nível da tabela pai
-- e propaga para partições. Os _idx1 são automáticos.
-- Solução: remover índice pai duplicado e manter apenas um

-- Verificar e remover índice pai duplicado se existir
DROP INDEX IF EXISTS public.idx_metrics_partitioned_agent_collected;
DROP INDEX IF EXISTS public.idx_metrics_partitioned_tenant_collected;

-- Nota: Os índices das partições serão limpos automaticamente
-- quando os índices pai forem removidos