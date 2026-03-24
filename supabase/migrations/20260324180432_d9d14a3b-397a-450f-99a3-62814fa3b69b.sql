-- V-OFFLINE: Tighten create_job_if_not_exists to block agents offline > 2h (aligned with edge functions)
-- Also handle NULL last_heartbeat as offline
CREATE OR REPLACE FUNCTION public.create_job_if_not_exists(
  p_agent_id uuid,
  p_tenant_id uuid,
  p_type text,
  p_payload jsonb DEFAULT '{}',
  p_priority integer DEFAULT 5,
  p_ttl_hours integer DEFAULT 4
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid;
  v_new_id uuid;
  v_agent_name text;
  v_agent_status text;
  v_scheduling_paused boolean;
  v_last_heartbeat timestamptz;
  v_minutes_since_heartbeat integer;
  v_effective_ttl_hours integer;
  v_is_recovery_job boolean;
BEGIN
  -- Determine if this is a recovery job (always allowed)
  v_is_recovery_job := p_type IN ('update_agent', 'reinstall_agent');

  -- Check if an active job of the same type already exists for this agent
  SELECT id INTO v_existing_id
  FROM jobs
  WHERE agent_id = p_agent_id
    AND type = p_type
    AND status IN ('pending', 'queued', 'delivered')
  LIMIT 1;

  IF v_existing_id IS NOT NULL THEN
    RETURN NULL;
  END IF;

  -- Lookup agent info
  SELECT agent_name, status, scheduling_paused, last_heartbeat
  INTO v_agent_name, v_agent_status, v_scheduling_paused, v_last_heartbeat
  FROM agents
  WHERE id = p_agent_id;

  IF v_agent_name IS NULL THEN
    RETURN NULL; -- Agent not found
  END IF;

  -- Block scheduling if paused (except recovery jobs)
  IF v_scheduling_paused = true AND NOT v_is_recovery_job THEN
    RETURN NULL;
  END IF;

  -- Block if agent is inactive/archived (except recovery jobs)
  IF v_agent_status IN ('inactive', 'archived', 'deleted') AND NOT v_is_recovery_job THEN
    RETURN NULL;
  END IF;

  -- V-OFFLINE: Block agents with no heartbeat or offline > 2h (except recovery jobs)
  IF NOT v_is_recovery_job THEN
    IF v_last_heartbeat IS NULL THEN
      RETURN NULL; -- Never seen online
    END IF;
    
    v_minutes_since_heartbeat := EXTRACT(EPOCH FROM (now() - v_last_heartbeat))::integer / 60;
    
    IF v_minutes_since_heartbeat > 120 THEN
      RETURN NULL; -- Offline > 2 hours
    END IF;
  END IF;

  -- Adaptive TTL based on heartbeat recency
  v_effective_ttl_hours := p_ttl_hours;
  
  IF v_last_heartbeat IS NOT NULL THEN
    v_minutes_since_heartbeat := COALESCE(v_minutes_since_heartbeat, 
      EXTRACT(EPOCH FROM (now() - v_last_heartbeat))::integer / 60);
    
    -- Agent heartbeat > 30min: reduce TTL to 2h
    IF v_minutes_since_heartbeat > 30 AND v_effective_ttl_hours > 2 THEN
      v_effective_ttl_hours := 2;
    END IF;
  END IF;

  -- Safe to insert
  INSERT INTO jobs (
    agent_id, tenant_id, type, payload, priority,
    status, approved, expires_at, created_at, agent_name
  ) VALUES (
    p_agent_id, p_tenant_id, p_type, p_payload, p_priority,
    'pending', true, now() + (v_effective_ttl_hours || ' hours')::interval, now(), v_agent_name
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.create_job_if_not_exists(uuid, uuid, text, jsonb, integer, integer) FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_job_if_not_exists(uuid, uuid, text, jsonb, integer, integer) TO service_role, authenticated;