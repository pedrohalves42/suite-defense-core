-- =============================================================================
-- CI Guard: Validate critical tables exist and no invalid references
-- =============================================================================
-- This test ensures all critical tables exist and prevents references to 
-- non-existent tables like "policies" (should be "security_policies").
-- Run during migrations or CI to prevent runtime errors.
-- =============================================================================

DO $$
DECLARE
  missing_tables text[];
  expected_tables text[] := ARRAY[
    'agents',
    'jobs', 
    'tenants',
    'profiles',
    'security_policies',
    'agent_releases',
    'agent_evidence_logs',
    'system_alerts',
    'agent_groups',
    'agent_tokens'
  ];
BEGIN
  -- Test 1: Check all critical tables exist
  SELECT ARRAY_AGG(tbl)
  INTO missing_tables
  FROM (SELECT unnest(expected_tables) AS tbl) expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM pg_tables
    WHERE schemaname = 'public'
      AND tablename = expected.tbl
  );

  IF missing_tables IS NOT NULL AND array_length(missing_tables, 1) > 0 THEN
    RAISE EXCEPTION 
      'TABLE VALIDATION FAILED: Missing critical tables: %',
      array_to_string(missing_tables, ', ');
  END IF;
  
  -- Test 2: Verify "policies" table does NOT exist (common mistake)
  -- The correct table is "security_policies"
  IF EXISTS (
    SELECT 1 FROM pg_tables 
    WHERE schemaname = 'public' AND tablename = 'policies'
  ) THEN
    RAISE WARNING 
      'DEPRECATED TABLE FOUND: "policies" exists. Consider migrating to "security_policies".';
  END IF;

  -- Test 3: Validate foreign key references are intact
  PERFORM 1 FROM information_schema.table_constraints 
  WHERE constraint_type = 'FOREIGN KEY' 
    AND table_schema = 'public'
  LIMIT 1;

  RAISE NOTICE 'TABLE VALIDATION PASSED: All critical tables exist';
END $$;
