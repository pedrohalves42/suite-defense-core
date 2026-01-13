-- =============================================================================
-- CI Guard: Validate v_agent_execution_health view schema
-- =============================================================================
-- This test ensures the view contains all columns required by:
-- - detect_improdutive_agents function
-- - detect_throttle_revert_candidates function
-- Run this during migrations or CI to prevent breaking changes.
-- =============================================================================

DO $$
DECLARE
  missing_columns text[];
  expected_cols text[] := ARRAY[
    'agent_id',
    'tenant_id',
    'agent_name',
    'status',
    'last_heartbeat',
    'agent_mode',
    'agent_version',
    'enrolled_at',
    'health_status',
    'seconds_since_heartbeat',
    'minutes_since_heartbeat',
    'minutes_since_execution',
    'last_execution_at',
    'stale_queued_jobs',
    'stale_delivered_jobs',
    'pending_jobs'
  ];
BEGIN
  SELECT ARRAY_AGG(col)
  INTO missing_columns
  FROM (SELECT unnest(expected_cols) AS col) expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'v_agent_execution_health'
      AND c.column_name = expected.col
  );

  IF missing_columns IS NOT NULL AND array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 
      'SCHEMA VALIDATION FAILED: v_agent_execution_health is missing required columns: %',
      array_to_string(missing_columns, ', ');
  END IF;
  
  RAISE NOTICE 'SCHEMA VALIDATION PASSED: v_agent_execution_health has all required columns';
END $$;
