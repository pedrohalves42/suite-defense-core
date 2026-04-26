-- P1 SCALE-02: Migration to partitioned metrics table
-- This migration ensures proper metrics partitioning and cleanup

-- 1. Create partitions for current and next 3 months if not exist
DO $$
DECLARE
  partition_name TEXT;
  start_date DATE;
  end_date DATE;
  i INTEGER;
BEGIN
  FOR i IN 0..3 LOOP
    start_date := date_trunc('month', CURRENT_DATE + (i || ' months')::INTERVAL)::DATE;
    end_date := (start_date + INTERVAL '1 month')::DATE;
    partition_name := 'agent_system_metrics_' || to_char(start_date, 'YYYY_MM');
    
    IF NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = partition_name AND n.nspname = 'public'
    ) THEN
      EXECUTE format(
        'CREATE TABLE IF NOT EXISTS public.%I PARTITION OF public.agent_system_metrics_partitioned FOR VALUES FROM (%L) TO (%L)',
        partition_name, start_date, end_date
      );
      RAISE NOTICE 'Created partition: %', partition_name;
    END IF;
  END LOOP;
END $$;

-- 2. Create cleanup function for old metrics (keep 90 days by default)
CREATE OR REPLACE FUNCTION public.cleanup_old_system_metrics(retention_days INTEGER DEFAULT 90)
RETURNS TABLE(deleted_count BIGINT, partition_name TEXT)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cutoff_date TIMESTAMP WITH TIME ZONE;
  v_deleted BIGINT := 0;
BEGIN
  cutoff_date := NOW() - (retention_days || ' days')::INTERVAL;
  
  -- Delete from partitioned table
  DELETE FROM public.agent_system_metrics_partitioned
  WHERE collected_at < cutoff_date;
  
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  
  deleted_count := v_deleted;
  partition_name := 'agent_system_metrics_partitioned';
  RETURN NEXT;
  
  -- Also cleanup from legacy non-partitioned table if exists
  IF EXISTS (
    SELECT 1 FROM information_schema.tables 
    WHERE table_schema = 'public' 
    AND table_name = 'agent_system_metrics'
  ) THEN
    DELETE FROM public.agent_system_metrics
    WHERE collected_at < cutoff_date;
    
    GET DIAGNOSTICS v_deleted = ROW_COUNT;
    
    deleted_count := v_deleted;
    partition_name := 'agent_system_metrics';
    RETURN NEXT;
  END IF;
  
  RETURN;
END;
$$;

-- 3. Create indices for better query performance on partitioned table
CREATE INDEX IF NOT EXISTS idx_metrics_partitioned_agent_collected 
  ON public.agent_system_metrics_partitioned (agent_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_metrics_partitioned_tenant_collected 
  ON public.agent_system_metrics_partitioned (tenant_id, collected_at DESC);

-- 4. Grant necessary permissions
GRANT EXECUTE ON FUNCTION public.cleanup_old_system_metrics(INTEGER) TO service_role;
GRANT EXECUTE ON FUNCTION public.cleanup_old_system_metrics(INTEGER) TO authenticated;

-- 5. Add comment for documentation
COMMENT ON FUNCTION public.cleanup_old_system_metrics IS 
  'P1 SCALE-02: Cleanup function for old system metrics. Default retention: 90 days. Call periodically via pg_cron or Edge Function.';

-- 6. Run initial cleanup to remove data older than 90 days
SELECT * FROM public.cleanup_old_system_metrics(90);