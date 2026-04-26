-- Fix: create_job_if_not_exists must include agent_name from agents table
CREATE OR REPLACE FUNCTION public.create_job_if_not_exists(
  p_agent_id uuid,
  p_tenant_id uuid,
  p_type text,
  p_payload jsonb DEFAULT '{}'::jsonb,
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
BEGIN
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

  -- Lookup agent_name for the trigger validation
  SELECT agent_name INTO v_agent_name
  FROM agents
  WHERE id = p_agent_id;

  IF v_agent_name IS NULL THEN
    RETURN NULL; -- Agent not found, skip silently
  END IF;

  -- Safe to insert
  INSERT INTO jobs (
    agent_id, tenant_id, type, payload, priority,
    status, approved, expires_at, created_at, agent_name
  ) VALUES (
    p_agent_id, p_tenant_id, p_type, p_payload, p_priority,
    'pending', true, now() + (p_ttl_hours || ' hours')::interval, now(), v_agent_name
  )
  RETURNING id INTO v_new_id;

  RETURN v_new_id;
EXCEPTION WHEN unique_violation THEN
  RETURN NULL;
END;
$$;

REVOKE ALL ON FUNCTION public.create_job_if_not_exists FROM public, anon;
GRANT EXECUTE ON FUNCTION public.create_job_if_not_exists TO service_role, authenticated;