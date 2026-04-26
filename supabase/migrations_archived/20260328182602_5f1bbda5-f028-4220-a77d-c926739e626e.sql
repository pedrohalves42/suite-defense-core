DO $$
DECLARE
  v_partition TEXT;
BEGIN
  FOR v_partition IN
    SELECT c.relname FROM pg_class c
    JOIN pg_namespace n ON n.oid = c.relnamespace
    JOIN pg_inherits i ON i.inhrelid = c.oid
    WHERE n.nspname = 'public'
      AND c.relkind = 'r'
      AND (c.relname LIKE 'audit_logs_%' OR c.relname LIKE 'job_executions_%')
      AND NOT c.relrowsecurity
  LOOP
    EXECUTE format('ALTER TABLE public.%I ENABLE ROW LEVEL SECURITY', v_partition);
  END LOOP;
END $$;