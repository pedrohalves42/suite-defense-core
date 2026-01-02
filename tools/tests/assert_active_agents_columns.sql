-- =============================================================================
-- CI Guard: Validate active_agents view schema
-- =============================================================================
-- This test ensures the active_agents view contains all columns from agents table.
-- Run this during migrations or CI to prevent breaking changes.
-- =============================================================================

DO $$
DECLARE
  missing_columns text[];
  expected_cols text[] := ARRAY[
    'id',
    'tenant_id',
    'agent_name',
    'hostname',
    'status',
    'last_heartbeat',
    'created_at',
    'updated_at',
    'archived_at'
  ];
BEGIN
  SELECT ARRAY_AGG(col)
  INTO missing_columns
  FROM (SELECT unnest(expected_cols) AS col) expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'active_agents'
      AND c.column_name = expected.col
  );

  IF missing_columns IS NOT NULL AND array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 
      'SCHEMA VALIDATION FAILED: active_agents is missing required columns: %',
      array_to_string(missing_columns, ', ');
  END IF;
  
  RAISE NOTICE 'SCHEMA VALIDATION PASSED: active_agents has all required columns';
END $$;
