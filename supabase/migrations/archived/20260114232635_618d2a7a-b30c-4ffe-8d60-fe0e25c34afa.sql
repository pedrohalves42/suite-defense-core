
-- =============================================================================
-- ADR-029 Phase 1-2: Fix claim_jobs_for_agent + v_agent_execution_health
-- =============================================================================

-- Phase 1: Drop all broken overloads of claim_jobs_for_agent
DROP FUNCTION IF EXISTS claim_jobs_for_agent(uuid, integer);
DROP FUNCTION IF EXISTS claim_jobs_for_agent(uuid, text, integer);
DROP FUNCTION IF EXISTS claim_jobs_for_agent(uuid, text, uuid, integer);

-- Create single correct version using jobs table
CREATE OR REPLACE FUNCTION claim_jobs_for_agent(
  p_agent_id uuid,
  p_agent_name text,
  p_tenant_id uuid,
  p_limit integer DEFAULT 10
)
RETURNS TABLE(
  job_id uuid,
  job_type text,
  payload jsonb,
  execution_id uuid,
  nonce uuid,
  payload_hash text,
  expires_at timestamptz,
  priority smallint
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH claimed AS (
    UPDATE jobs
    SET 
      status = 'delivered',
      agent_id = p_agent_id,
      agent_name = p_agent_name,
      delivered_at = now(),
      delivery_attempts = delivery_attempts + 1
    WHERE jobs.id IN (
      SELECT j.id
      FROM jobs j
      WHERE j.status IN ('queued', 'pending')
        AND j.tenant_id = p_tenant_id
        AND j.approved = true
        AND (j.scheduled_at IS NULL OR j.scheduled_at <= now())
        AND (j.expires_at IS NULL OR j.expires_at > now())
      ORDER BY j.priority DESC NULLS LAST, j.created_at ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING jobs.id, jobs.type, jobs.payload, jobs.payload_hash, jobs.expires_at, jobs.priority
  )
  SELECT 
    c.id as job_id,
    c.type as job_type,
    c.payload,
    c.id as execution_id,
    gen_random_uuid() as nonce,
    c.payload_hash,
    COALESCE(c.expires_at, now() + interval '1 hour') as expires_at,
    c.priority
  FROM claimed c;
END;
$$;

-- Create simplified overload for backwards compatibility
CREATE OR REPLACE FUNCTION claim_jobs_for_agent(
  p_agent_id uuid,
  p_limit integer
)
RETURNS TABLE(
  job_id uuid,
  job_type text,
  payload jsonb,
  payload_hash text,
  expires_at timestamptz,
  execution_id uuid,
  nonce uuid,
  execution_index bigint,
  previous_execution_hash text
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_agent_name text;
BEGIN
  -- Get agent's tenant_id and name
  SELECT a.tenant_id, a.agent_name INTO v_tenant_id, v_agent_name
  FROM agents a
  WHERE a.id = p_agent_id;

  IF v_tenant_id IS NULL THEN
    RETURN;
  END IF;

  RETURN QUERY
  WITH claimed AS (
    UPDATE jobs
    SET 
      status = 'delivered',
      agent_id = p_agent_id,
      agent_name = v_agent_name,
      delivered_at = now(),
      delivery_attempts = delivery_attempts + 1
    WHERE jobs.id IN (
      SELECT j.id
      FROM jobs j
      WHERE j.status IN ('queued', 'pending')
        AND j.tenant_id = v_tenant_id
        AND j.approved = true
        AND (j.scheduled_at IS NULL OR j.scheduled_at <= now())
        AND (j.expires_at IS NULL OR j.expires_at > now())
      ORDER BY j.priority DESC NULLS LAST, j.created_at ASC
      LIMIT p_limit
      FOR UPDATE SKIP LOCKED
    )
    RETURNING jobs.id, jobs.type, jobs.payload, jobs.payload_hash, jobs.expires_at
  )
  SELECT 
    c.id as job_id,
    c.type as job_type,
    c.payload,
    c.payload_hash,
    COALESCE(c.expires_at, now() + interval '1 hour') as expires_at,
    c.id as execution_id,
    gen_random_uuid() as nonce,
    0::bigint as execution_index,
    '' as previous_execution_hash
  FROM claimed c;
END;
$$;

COMMENT ON FUNCTION claim_jobs_for_agent(uuid, text, uuid, integer) IS 'ADR-029: Claims pending jobs for an agent from the jobs table';
COMMENT ON FUNCTION claim_jobs_for_agent(uuid, integer) IS 'ADR-029: Simplified overload that auto-resolves tenant from agent';

-- =============================================================================
-- Phase 2: Recreate v_agent_execution_health with security_invoker
-- =============================================================================

DROP VIEW IF EXISTS v_agent_execution_health;
CREATE VIEW v_agent_execution_health WITH (security_invoker = true) AS
SELECT 
  a.id AS agent_id,
  a.tenant_id,
  a.agent_name,
  a.status,
  a.last_heartbeat,
  a.agent_mode,
  a.agent_version,
  a.enrolled_at,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_seen'::text
    WHEN a.last_heartbeat < (now() - '00:15:00'::interval) THEN 'offline'::text
    WHEN a.last_heartbeat < (now() - '00:05:00'::interval) THEN 'degraded'::text
    WHEN a.agent_mode = 'safe_mode'::text THEN 'safe_mode'::text
    WHEN le.last_execution_at IS NULL THEN 'not_executing_jobs'::text
    WHEN le.last_execution_at < (now() - '02:00:00'::interval) THEN 'execution_stale'::text
    WHEN COALESCE(jq.stale_queued, 0::bigint) >= 3 THEN 'not_polling_jobs'::text
    ELSE 'healthy'::text
  END AS health_status,
  EXTRACT(epoch FROM now() - a.last_heartbeat)::integer AS seconds_since_heartbeat,
  (EXTRACT(epoch FROM now() - a.last_heartbeat) / 60::numeric)::integer AS minutes_since_heartbeat,
  (EXTRACT(epoch FROM now() - le.last_execution_at) / 60::numeric)::integer AS minutes_since_execution,
  le.last_execution_at,
  COALESCE(jq.stale_queued, 0::bigint)::integer AS stale_queued_jobs,
  COALESCE(jq.stale_delivered, 0::bigint)::integer AS stale_delivered_jobs,
  COALESCE(jq.pending, 0::bigint)::integer AS pending_jobs
FROM agents a
LEFT JOIN LATERAL (
  SELECT max(je.finished_at) AS last_execution_at
  FROM job_executions je
  WHERE je.agent_id = a.id
) le ON true
LEFT JOIN LATERAL (
  SELECT 
    count(*) FILTER (WHERE j.status = 'queued'::text AND j.created_at < (now() - '01:00:00'::interval)) AS stale_queued,
    count(*) FILTER (WHERE j.status = 'delivered'::text AND j.created_at < (now() - '01:00:00'::interval)) AS stale_delivered,
    count(*) FILTER (WHERE j.status = ANY (ARRAY['queued'::text, 'delivered'::text])) AS pending
  FROM jobs j
  WHERE j.agent_id = a.id
) jq ON true
WHERE a.archived_at IS NULL;

GRANT SELECT ON v_agent_execution_health TO authenticated;
GRANT SELECT ON v_agent_execution_health TO service_role;

COMMENT ON VIEW v_agent_execution_health IS 'ADR-029: Agent execution health with security_invoker enabled';
