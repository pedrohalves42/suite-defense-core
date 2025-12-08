-- =====================================================
-- Fix RLS on partition tables and view security
-- =====================================================

-- 1. Enable RLS on all created partitions (they inherit from parent but need explicit enable)
DO $$
DECLARE
  partition_rec RECORD;
BEGIN
  FOR partition_rec IN
    SELECT c.relname
    FROM pg_class c
    JOIN pg_inherits i ON c.oid = i.inhrelid
    JOIN pg_namespace n ON c.relnamespace = n.oid
    WHERE i.inhparent = 'public.agent_system_metrics_partitioned'::regclass
      AND n.nspname = 'public'
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', partition_rec.relname);
    RAISE NOTICE 'RLS enabled on: %', partition_rec.relname;
  END LOOP;
END $$;

-- 2. Drop and recreate the unified view with security_invoker
DROP VIEW IF EXISTS public.agent_system_metrics_unified;

CREATE VIEW public.agent_system_metrics_unified
WITH (security_invoker = on)
AS
SELECT * FROM public.agent_system_metrics
UNION ALL
SELECT * FROM public.agent_system_metrics_partitioned
WHERE collected_at >= CURRENT_DATE - INTERVAL '90 days';

COMMENT ON VIEW public.agent_system_metrics_unified IS 
'View unificada com security_invoker para compatibilidade RLS. Combina dados da tabela original com particionada.';