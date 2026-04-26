
-- ============================================================
-- FASE 1: Auto-pause scheduling for inactive agents
-- Eliminates ~53% of job failures (AGENT_OFFLINE + TTL)
-- ============================================================

-- 1. Immediately pause all currently inactive agents
UPDATE agents
SET scheduling_paused = true,
    scheduling_paused_reason = 'auto: agent inactive'
WHERE status = 'inactive'
  AND (scheduling_paused = false OR scheduling_paused IS NULL);

-- 2. Cancel all pending/queued jobs for inactive agents
UPDATE jobs
SET status = 'failed',
    error_message = 'AUTO_CANCELLED: agent inactive, scheduling paused',
    completed_at = now()
WHERE agent_id IN (SELECT id FROM agents WHERE status = 'inactive')
  AND status IN ('pending', 'queued')
  AND completed_at IS NULL;

-- 3. Trigger: auto-pause when agent becomes inactive
CREATE OR REPLACE FUNCTION auto_pause_scheduling_on_inactive()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Agent transitioning TO inactive
  IF NEW.status = 'inactive' AND OLD.status != 'inactive' THEN
    NEW.scheduling_paused := true;
    NEW.scheduling_paused_reason := 'auto: agent went inactive at ' || now()::text;
  END IF;

  -- Agent transitioning FROM inactive to active (resume)
  IF NEW.status = 'active' AND OLD.status = 'inactive' THEN
    NEW.scheduling_paused := false;
    NEW.scheduling_paused_reason := null;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_auto_pause_scheduling ON agents;
CREATE TRIGGER trg_auto_pause_scheduling
  BEFORE UPDATE ON agents
  FOR EACH ROW
  EXECUTE FUNCTION auto_pause_scheduling_on_inactive();

-- 4. Function to get zombie threshold by job type (for Fase 3)
CREATE OR REPLACE FUNCTION get_zombie_threshold_minutes(p_job_type text)
RETURNS integer
LANGUAGE sql
IMMUTABLE
AS $$
  SELECT CASE
    -- Fast collection jobs: 30 min
    WHEN p_job_type LIKE 'collect_%' THEN 30
    WHEN p_job_type = 'light_vuln_scan' THEN 30
    WHEN p_job_type = 'integration_test_v3' THEN 30
    WHEN p_job_type = 'health_check' THEN 15
    WHEN p_job_type = 'config' THEN 15
    -- Heavy jobs: 60 min
    WHEN p_job_type = 'software_inventory_collect' THEN 60
    WHEN p_job_type = 'disk_cleanup' THEN 60
    -- Action jobs: 120 min (keep current)
    WHEN p_job_type = 'update_agent' THEN 120
    WHEN p_job_type = 'apply_security_patch' THEN 120
    WHEN p_job_type = 'reinstall_agent' THEN 120
    -- Default: 45 min
    ELSE 45
  END;
$$;

-- 5. Enhanced create_job_if_not_exists with TTL adaptativo (Fase 4)
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

  -- Block if agent is inactive (except recovery jobs)
  IF v_agent_status = 'inactive' AND NOT v_is_recovery_job THEN
    RETURN NULL;
  END IF;

  -- Adaptive TTL based on heartbeat recency
  v_effective_ttl_hours := p_ttl_hours;
  
  IF v_last_heartbeat IS NOT NULL THEN
    v_minutes_since_heartbeat := EXTRACT(EPOCH FROM (now() - v_last_heartbeat))::integer / 60;
    
    -- Agent offline > 60min: reject non-recovery jobs
    IF v_minutes_since_heartbeat > 60 AND NOT v_is_recovery_job THEN
      RETURN NULL;
    END IF;
    
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

REVOKE ALL ON FUNCTION public.create_job_if_not_exists FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_job_if_not_exists TO service_role, authenticated;
