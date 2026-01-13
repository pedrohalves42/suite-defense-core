-- =============================================================================
-- CI Guard: Validate critical functions exist and work correctly
-- =============================================================================
-- This test ensures detection functions don't reference non-existent columns
-- and return compatible types. Run during CI to prevent runtime errors.
-- =============================================================================

DO $$
DECLARE
  func_result RECORD;
BEGIN
  -- Test 1: detect_silent_job_failures() exists and executes without error
  BEGIN
    PERFORM * FROM detect_silent_job_failures() LIMIT 0;
    RAISE NOTICE 'PASS: detect_silent_job_failures() executes correctly';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: detect_silent_job_failures() error: %', SQLERRM;
  END;

  -- Test 2: check_offline_agents_for_playbook() (no params) exists and executes
  BEGIN
    PERFORM * FROM check_offline_agents_for_playbook() LIMIT 0;
    RAISE NOTICE 'PASS: check_offline_agents_for_playbook() executes correctly';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: check_offline_agents_for_playbook() error: %', SQLERRM;
  END;

  -- Test 3: detect_improdutive_agents() exists and executes
  BEGIN
    PERFORM * FROM detect_improdutive_agents() LIMIT 0;
    RAISE NOTICE 'PASS: detect_improdutive_agents() executes correctly';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: detect_improdutive_agents() error: %', SQLERRM;
  END;

  -- Test 4: detect_throttle_revert_candidates() exists and executes
  BEGIN
    PERFORM * FROM detect_throttle_revert_candidates() LIMIT 0;
    RAISE NOTICE 'PASS: detect_throttle_revert_candidates() executes correctly';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: detect_throttle_revert_candidates() error: %', SQLERRM;
  END;

  -- Test 5: Validate detect_silent_job_failures returns expected columns
  -- This catches column reference errors like j.name or j.executed_at
  BEGIN
    PERFORM job_id, tenant_id, agent_id, job_name, job_type, last_status, 
            last_execution_at, hours_since_execution, violation_type
    FROM detect_silent_job_failures() LIMIT 0;
    RAISE NOTICE 'PASS: detect_silent_job_failures() return columns are correct';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: detect_silent_job_failures() column validation error: %', SQLERRM;
  END;

  -- Test 6: Validate check_offline_agents_for_playbook returns expected columns
  BEGIN
    PERFORM agent_id, tenant_id, agent_name, last_heartbeat, minutes_offline, playbook_triggered
    FROM check_offline_agents_for_playbook() LIMIT 0;
    RAISE NOTICE 'PASS: check_offline_agents_for_playbook() return columns are correct';
  EXCEPTION WHEN OTHERS THEN
    RAISE EXCEPTION 'FAIL: check_offline_agents_for_playbook() column validation error: %', SQLERRM;
  END;

  RAISE NOTICE 'ALL FUNCTION VALIDATION TESTS PASSED';
END $$;
