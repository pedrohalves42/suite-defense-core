-- =============================================================================
-- CI Guard: Validate v_agent_lifecycle_state view schema
-- =============================================================================
-- This test ensures the view contains all columns expected by frontend components.
-- Run this during migrations or CI to prevent breaking changes.
-- 
-- Expected result: No exception = success
-- On failure: Raises exception with list of missing columns
-- =============================================================================

DO $$
DECLARE
  missing_columns text[];
BEGIN
  -- Define expected columns for v_agent_lifecycle_state
  SELECT ARRAY_AGG(col)
  INTO missing_columns
  FROM (
    SELECT unnest(ARRAY[
      'agent_id',
      'agent_name',
      'status',
      'enrolled_at',
      'last_heartbeat',
      'command_copied_at',
      'agent_installed_at',
      'minutes_between_copy_and_install',
      'is_stuck'
    ]) AS col
  ) expected
  WHERE NOT EXISTS (
    SELECT 1
    FROM information_schema.columns c
    WHERE c.table_schema = 'public'
      AND c.table_name = 'v_agent_lifecycle_state'
      AND c.column_name = expected.col
  );

  -- Raise exception if any columns are missing
  IF missing_columns IS NOT NULL AND array_length(missing_columns, 1) > 0 THEN
    RAISE EXCEPTION 
      'SCHEMA VALIDATION FAILED: v_agent_lifecycle_state is missing required columns: %',
      array_to_string(missing_columns, ', ');
  END IF;
  
  RAISE NOTICE 'SCHEMA VALIDATION PASSED: v_agent_lifecycle_state has all required columns';
END $$;
