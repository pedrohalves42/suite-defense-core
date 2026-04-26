-- Drop and recreate with updated default retention
DROP FUNCTION IF EXISTS public.drop_old_telemetry_partitions(INTEGER);

CREATE OR REPLACE FUNCTION public.drop_old_telemetry_partitions(retention_days INTEGER DEFAULT 30)
RETURNS void
LANGUAGE plpgsql
SET search_path = public
AS $$
DECLARE
  partition_record RECORD;
  cutoff_date DATE;
  partition_date DATE;
BEGIN
  cutoff_date := CURRENT_DATE - (retention_days || ' days')::INTERVAL;
  
  FOR partition_record IN
    SELECT c.relname AS partition_name
    FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (
        c.relname ~ '^endpoint_event_buffer_partitioned_\d{4}_\d{2}$'
        OR c.relname ~ '^endpoint_process_events_partitioned_\d{4}_\d{2}$'
        OR c.relname ~ '^endpoint_network_events_partitioned_\d{4}_\d{2}$'
        OR c.relname ~ '^agent_system_metrics_\d{4}_\d{2}$'
        OR c.relname ~ '^hmac_signatures_\d{4}_\d{2}$'
      )
    ORDER BY c.relname
  LOOP
    BEGIN
      partition_date := TO_DATE(
        REGEXP_REPLACE(partition_record.partition_name, '.*_(\d{4})_(\d{2})$', '\1-\2-01'),
        'YYYY-MM-DD'
      );
      
      IF partition_date < cutoff_date THEN
        EXECUTE FORMAT('DROP TABLE IF EXISTS public.%I', partition_record.partition_name);
        RAISE NOTICE 'Dropped old partition: %', partition_record.partition_name;
      END IF;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to process partition %: %', partition_record.partition_name, SQLERRM;
    END;
  END LOOP;
END;
$$;