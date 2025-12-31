-- Remove legacy get_audit_raw_metrics() function (without parameters)
-- The correct version with p_tenant_id parameter will remain
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.proname = 'get_audit_raw_metrics'
      AND p.pronargs = 0
  ) THEN
    DROP FUNCTION public.get_audit_raw_metrics();
    RAISE NOTICE 'Legacy function get_audit_raw_metrics() dropped successfully';
  ELSE
    RAISE NOTICE 'Legacy function get_audit_raw_metrics() not found - already removed';
  END IF;
END;
$$;