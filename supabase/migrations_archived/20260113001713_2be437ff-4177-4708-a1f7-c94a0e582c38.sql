-- =============================================================================
-- Phase 1.1: Recreate v_agent_execution_health with ALL required columns
-- =============================================================================
-- This fixes detect_improdutive_agents and detect_throttle_revert_candidates
-- by adding: minutes_since_heartbeat, minutes_since_execution, stale_queued_jobs, pending_jobs
-- =============================================================================

DROP VIEW IF EXISTS v_agent_execution_health CASCADE;

CREATE VIEW v_agent_execution_health AS
SELECT 
  a.id AS agent_id,
  a.tenant_id,
  a.agent_name,
  a.status,
  a.last_heartbeat,
  a.agent_mode,
  a.agent_version,
  a.enrolled_at,
  -- Health status calculation
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_seen'
    WHEN a.last_heartbeat < (now() - interval '15 minutes') THEN 'offline'
    WHEN a.last_heartbeat < (now() - interval '5 minutes') THEN 'degraded'
    WHEN a.agent_mode = 'safe_mode' THEN 'safe_mode'
    WHEN le.last_execution_at IS NULL THEN 'not_executing_jobs'
    WHEN le.last_execution_at < (now() - interval '2 hours') THEN 'execution_stale'
    WHEN COALESCE(jq.stale_queued, 0) >= 3 THEN 'not_polling_jobs'
    ELSE 'healthy'
  END AS health_status,
  -- Time calculations (seconds)
  EXTRACT(epoch FROM now() - a.last_heartbeat)::integer AS seconds_since_heartbeat,
  -- Time calculations (minutes) - REQUIRED by detect_improdutive_agents
  (EXTRACT(epoch FROM now() - a.last_heartbeat) / 60)::integer AS minutes_since_heartbeat,
  (EXTRACT(epoch FROM now() - le.last_execution_at) / 60)::integer AS minutes_since_execution,
  le.last_execution_at,
  -- Job metrics - REQUIRED by detect_throttle_revert_candidates
  COALESCE(jq.stale_queued, 0)::integer AS stale_queued_jobs,
  COALESCE(jq.stale_delivered, 0)::integer AS stale_delivered_jobs,
  COALESCE(jq.pending, 0)::integer AS pending_jobs
FROM agents a
LEFT JOIN LATERAL (
  SELECT MAX(je.finished_at) as last_execution_at
  FROM job_executions je
  WHERE je.agent_id = a.id
) le ON true
LEFT JOIN LATERAL (
  SELECT 
    COUNT(*) FILTER (WHERE j.status = 'queued' AND j.created_at < now() - interval '1 hour') as stale_queued,
    COUNT(*) FILTER (WHERE j.status = 'delivered' AND j.created_at < now() - interval '1 hour') as stale_delivered,
    COUNT(*) FILTER (WHERE j.status IN ('queued', 'delivered')) as pending
  FROM jobs j
  WHERE j.agent_id = a.id
) jq ON true
WHERE a.archived_at IS NULL;

COMMENT ON VIEW v_agent_execution_health IS 
'Agent execution health view with all metrics required by detect_improdutive_agents and detect_throttle_revert_candidates functions. Includes minutes_since_heartbeat, minutes_since_execution, stale_queued_jobs, and pending_jobs.';