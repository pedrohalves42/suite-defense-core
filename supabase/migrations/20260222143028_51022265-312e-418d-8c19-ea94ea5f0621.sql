
-- =============================================================================
-- V-001 FIX: Revoke anon/public EXECUTE on ALL SECURITY DEFINER functions
-- This is the single most critical security fix for CyberShield.
-- Agents use service_role (unaffected). Dashboard uses authenticated (unaffected).
-- Trigger functions are called internally (unaffected).
-- =============================================================================

DO $$
DECLARE
  r RECORD;
  revoked_count INTEGER := 0;
BEGIN
  FOR r IN
    SELECT p.oid, p.proname, pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true
      AND has_function_privilege('anon', p.oid, 'execute')
  LOOP
    BEGIN
      EXECUTE format(
        'REVOKE ALL ON FUNCTION public.%I(%s) FROM public, anon',
        r.proname, r.args
      );
      revoked_count := revoked_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to revoke on %: %', r.proname, SQLERRM;
    END;
  END LOOP;
  
  RAISE NOTICE 'V-001 FIX COMPLETE: Revoked anon/public access from % SECURITY DEFINER functions', revoked_count;
END $$;

-- =============================================================================
-- VALIDATION: Confirm zero anon-callable SECURITY DEFINER functions remain
-- =============================================================================
DO $$
DECLARE
  remaining INTEGER;
BEGIN
  SELECT COUNT(*) INTO remaining
  FROM pg_proc p
  JOIN pg_namespace n ON p.pronamespace = n.oid
  WHERE n.nspname = 'public'
    AND p.prosecdef = true
    AND has_function_privilege('anon', p.oid, 'execute');
  
  IF remaining > 0 THEN
    RAISE WARNING 'V-001 VALIDATION: % functions still callable by anon', remaining;
  ELSE
    RAISE NOTICE 'V-001 VALIDATION PASSED: Zero SECURITY DEFINER functions callable by anon';
  END IF;
END $$;
