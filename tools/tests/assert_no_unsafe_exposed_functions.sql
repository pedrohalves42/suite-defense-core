-- =============================================================================
-- CI Guard: Validate No Sensitive Functions Exposed to Public Roles (ADR-026)
-- =============================================================================
-- This test ensures sensitive SECURITY DEFINER functions are not callable
-- by anon or authenticated roles without proper validation.
-- Run this during migrations or CI to prevent security regressions.
-- =============================================================================

DO $$
DECLARE
  v_unsafe_functions text[];
  v_unsafe_count integer;
BEGIN
  -- Check for sensitive functions that should NOT be executable by public roles
  -- These functions expose cryptographic material, secrets, or allow privilege escalation
  
  WITH sensitive_functions AS (
    SELECT unnest(ARRAY[
      'get_enrollment_key_full',
      'get_valid_agent_signing_key',
      'get_valid_agent_signing_key_by_agent',
      'register_agent_signing_key',
      'revoke_agent_signing_key',
      'backfill_audit_log_hashes'
    ]) AS func_name
  ),
  exposed_functions AS (
    SELECT 
      p.proname::text as func_name
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public'
      AND p.prosecdef = true  -- SECURITY DEFINER
      AND p.proname IN (SELECT func_name FROM sensitive_functions)
      AND EXISTS (
        SELECT 1 
        FROM information_schema.role_routine_grants rrg 
        WHERE rrg.routine_name = p.proname::text
          AND rrg.routine_schema = 'public'
          AND rrg.grantee IN ('anon', 'authenticated')
          AND rrg.privilege_type = 'EXECUTE'
      )
  )
  SELECT array_agg(func_name) INTO v_unsafe_functions
  FROM exposed_functions;
  
  v_unsafe_count := COALESCE(array_length(v_unsafe_functions, 1), 0);
  
  IF v_unsafe_count > 0 THEN
    RAISE EXCEPTION '
????????????????????????????????????????????????????????????????????
?  SECURITY VIOLATION: Sensitive functions exposed to public roles ?
????????????????????????????????????????????????????????????????????
?  Affected functions: %                                           
?                                                                   
?  These SECURITY DEFINER functions expose secrets or allow        
?  privilege escalation and should NOT be callable by anon         
?  or authenticated roles.                                         
?                                                                   
?  FIX: Run REVOKE EXECUTE ON FUNCTION <name> FROM anon, authenticated;
?                                                                   
?  REF: docs/architecture/ADR-026-multi-tenant-isolation.md       
????????????????????????????????????????????????????????????????????
', v_unsafe_functions;
  END IF;

  RAISE NOTICE 'SECURITY CHECK PASSED: No sensitive functions exposed to public roles';
END $$;

SELECT 'Sensitive functions exposure check passed' AS result;
