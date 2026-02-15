
-- ============================================================
-- 1. auto_mark_agents_inactive: Marks agents as 'inactive' 
--    when they haven't sent a heartbeat in >2 hours
-- ============================================================
CREATE OR REPLACE FUNCTION public.auto_mark_agents_inactive()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_count integer := 0;
  v_threshold interval := '2 hours';
  v_cutoff timestamptz := now() - v_threshold;
  v_result jsonb;
BEGIN
  -- Only mark agents that are currently 'active' but haven't sent heartbeat
  UPDATE agents
  SET 
    status = 'inactive',
    agent_state = 'inactive',
    agent_state_changed_at = now(),
    agent_state_reason = format('Auto-marked inactive: no heartbeat for >%s', v_threshold)
  WHERE status = 'active'
    AND last_heartbeat IS NOT NULL
    AND last_heartbeat < v_cutoff;
  
  GET DIAGNOSTICS v_count = ROW_COUNT;
  
  v_result := jsonb_build_object(
    'success', true,
    'agents_marked_inactive', v_count,
    'threshold', v_threshold::text,
    'cutoff_time', v_cutoff,
    'executed_at', now()
  );
  
  -- Log to cron health
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('auto-mark-inactive', now(), 0, now(), v_result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = now(),
    consecutive_failures = 0,
    last_error = NULL,
    updated_at = now(),
    last_result = EXCLUDED.last_result;
  
  RETURN v_result;
END;
$$;

COMMENT ON FUNCTION public.auto_mark_agents_inactive IS 
'Automatically marks agents as inactive when no heartbeat received for >2 hours. Should be called by cron every 15 minutes.';

-- ============================================================
-- 2. Enhanced cleanup_jobs_for_offline_agents: 
--    Immediately cancels pending/queued jobs for agents offline >2h
--    with reduced TTL (cancel immediately, don't wait 4h)
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_jobs_for_offline_agents()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  cancelled_count integer := 0;
  result jsonb;
BEGIN
  -- Cancel ALL pending/queued jobs for agents offline >2h
  -- No need to wait for TTL expiry - cancel immediately
  UPDATE jobs 
  SET 
    status = 'cancelled', 
    completed_at = NOW(),
    error_message = '[AUTO-CLEANUP] Job cancelled: Agent offline >2h',
    failure_class = 'AGENT_OFFLINE'
  WHERE status IN ('pending', 'queued')
    AND agent_id IN (
      SELECT id FROM agents 
      WHERE status = 'inactive' 
         OR (last_heartbeat IS NOT NULL AND last_heartbeat < NOW() - INTERVAL '2 hours')
         OR last_heartbeat IS NULL
    );
  GET DIAGNOSTICS cancelled_count = ROW_COUNT;
  
  result := jsonb_build_object(
    'success', true, 
    'jobs_cancelled', cancelled_count, 
    'executed_at', NOW()
  );
  
  INSERT INTO cron_health_checks (cron_name, last_success_at, consecutive_failures, updated_at, last_result)
  VALUES ('cleanup-jobs-offline-agents', NOW(), 0, NOW(), result)
  ON CONFLICT (cron_name) DO UPDATE SET
    last_success_at = NOW(), 
    consecutive_failures = 0, 
    last_error = NULL,
    updated_at = NOW(), 
    last_result = EXCLUDED.last_result;
  
  RETURN result;
EXCEPTION WHEN OTHERS THEN
  INSERT INTO cron_health_checks (cron_name, last_failure_at, last_error, consecutive_failures, updated_at)
  VALUES ('cleanup-jobs-offline-agents', NOW(), SQLERRM, 1, NOW())
  ON CONFLICT (cron_name) DO UPDATE SET
    last_failure_at = NOW(), 
    last_error = SQLERRM,
    consecutive_failures = cron_health_checks.consecutive_failures + 1, 
    updated_at = NOW();
  RAISE;
END;
$$;
