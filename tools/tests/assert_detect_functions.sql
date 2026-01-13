-- =============================================================================
-- CI Guard: Validate detection functions exist
-- =============================================================================
-- This test ensures all critical detection functions used by AI rules exist.
-- Run this during migrations or CI to prevent breaking AI automation.
-- =============================================================================

DO $$
DECLARE
  missing_functions text[];
  expected_funcs text[] := ARRAY[
    'detect_silent_job_failures',
    'detect_improdutive_agents',
    'detect_throttle_revert_candidates'
  ];
BEGIN
  SELECT ARRAY_AGG(func)
  INTO missing_functions
  FROM (SELECT unnest(expected_funcs) AS func) expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_proc p
    JOIN pg_namespace n ON n.oid = p.pronamespace
    WHERE n.nspname = 'public'
      AND p.proname = expected.func
  );

  IF missing_functions IS NOT NULL AND array_length(missing_functions, 1) > 0 THEN
    RAISE EXCEPTION 
      'FUNCTION VALIDATION FAILED: Missing required detection functions: %',
      array_to_string(missing_functions, ', ');
  END IF;
  
  RAISE NOTICE 'FUNCTION VALIDATION PASSED: All detection functions exist';
END $$;
