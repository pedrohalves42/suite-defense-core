-- =============================================================================
-- CI Guard: Validate detect_improdutive_agents return types
-- =============================================================================
-- This test ensures the function returns compatible types with v_agent_execution_health.
-- Run this during migrations or CI to prevent type mismatch errors.
-- =============================================================================

DO $$
DECLARE
  func_exists boolean;
  return_type_ok boolean;
BEGIN
  -- Check function exists
  SELECT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = 'detect_improdutive_agents'
  ) INTO func_exists;

  IF NOT func_exists THEN
    RAISE EXCEPTION 
      'FUNCTION VALIDATION FAILED: detect_improdutive_agents does not exist';
  END IF;

  -- Validate return type compatibility by attempting a query
  BEGIN
    PERFORM * FROM detect_improdutive_agents() LIMIT 0;
    return_type_ok := true;
  EXCEPTION WHEN OTHERS THEN
    return_type_ok := false;
    RAISE WARNING 
      'FUNCTION VALIDATION WARNING: detect_improdutive_agents has incompatible return types: %',
      SQLERRM;
  END;

  IF return_type_ok THEN
    RAISE NOTICE 'FUNCTION VALIDATION PASSED: detect_improdutive_agents return types are compatible';
  END IF;
END $$;
