
-- Fix SECURITY DEFINER functions missing SET search_path
-- This prevents search_path hijacking attacks
DO $$
DECLARE
  r RECORD;
  alter_stmt TEXT;
BEGIN
  FOR r IN
    SELECT n.nspname, p.proname, 
           pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE p.prosecdef = true
      AND n.nspname = 'public'
      AND (p.proconfig IS NULL OR NOT EXISTS (
        SELECT 1 FROM unnest(p.proconfig) AS c(val) 
        WHERE c.val LIKE 'search_path=%'
      ))
  LOOP
    alter_stmt := format(
      'ALTER FUNCTION %I.%I(%s) SET search_path = public',
      r.nspname, r.proname, r.args
    );
    EXECUTE alter_stmt;
    RAISE NOTICE 'Fixed: %.%(%)', r.nspname, r.proname, r.args;
  END LOOP;
END $$;
