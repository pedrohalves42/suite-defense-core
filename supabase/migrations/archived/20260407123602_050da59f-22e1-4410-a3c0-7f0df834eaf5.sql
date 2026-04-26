-- Remove redundant immutability trigger on audit_logs
-- trg_immutable_audit_logs already prevents UPDATE/DELETE with the same logic
DROP TRIGGER IF EXISTS tr_prevent_audit_modification ON public.audit_logs;

-- Also drop the orphaned function if no other triggers use it
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_trigger t 
    JOIN pg_proc p ON t.tgfoid = p.oid 
    WHERE p.proname = 'prevent_audit_modification'
    AND t.tgname != 'tr_prevent_audit_modification'
  ) THEN
    DROP FUNCTION IF EXISTS public.prevent_audit_modification() CASCADE;
  END IF;
END;
$$;