
-- =============================================================================
-- PSIA FIX V-003: register_agent_signing_key - drop and recreate with tenant guard
-- Must DROP first because return type changes from TABLE to jsonb
-- =============================================================================
DROP FUNCTION IF EXISTS public.register_agent_signing_key(uuid, text, text, text);

CREATE OR REPLACE FUNCTION public.register_agent_signing_key(p_agent_id uuid, p_public_key text, p_fingerprint text, p_algorithm text DEFAULT 'RSA-SHA256')
RETURNS TABLE(key_id uuid, version integer, valid_from timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_new_version INT;
  v_key_id UUID;
  v_valid_from TIMESTAMPTZ;
  v_tenant_id UUID;
  v_caller_tenant UUID;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  
  SELECT tenant_id INTO v_tenant_id FROM agents WHERE id = p_agent_id;
  
  IF v_tenant_id IS NULL THEN
    RAISE EXCEPTION 'AGENT_NOT_FOUND';
  END IF;
  
  -- PSIA: cross-tenant guard (INV-001)
  IF v_caller_tenant IS NOT NULL AND v_tenant_id != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'register_agent_signing_key', 'target_agent', p_agent_id));
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;
  
  SELECT COALESCE(MAX(ask.version), 0) + 1 INTO v_new_version
  FROM agent_signing_keys ask WHERE ask.agent_id = p_agent_id;
  
  v_valid_from := NOW();
  
  INSERT INTO agent_signing_keys (agent_id, public_key, key_fingerprint, version, algorithm, valid_from)
  VALUES (p_agent_id, p_public_key, p_fingerprint, v_new_version, p_algorithm, v_valid_from)
  RETURNING id INTO v_key_id;
  
  UPDATE agent_signing_keys SET is_active = false, valid_until = v_valid_from
  WHERE agent_id = p_agent_id AND id != v_key_id AND is_active = true;
  
  RETURN QUERY SELECT v_key_id, v_new_version, v_valid_from;
END;
$$;

-- Also fix remaining critical RPCs not covered in previous migration
-- V-006: create_job_if_not_exists (uses p_agent_id, no tenant check)
-- This is called by edge functions with service_role, so we add a guard that allows service_role
CREATE OR REPLACE FUNCTION public.create_job_if_not_exists(
  p_agent_id uuid, p_job_type text, p_tenant_id uuid,
  p_priority integer DEFAULT 5, p_payload jsonb DEFAULT '{}'::jsonb,
  p_max_retries integer DEFAULT 3, p_timeout_seconds integer DEFAULT 300,
  p_idempotency_key text DEFAULT NULL
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
  v_effective_timeout integer;
  v_caller_tenant uuid;
BEGIN
  -- PSIA: tenant guard
  v_caller_tenant := get_active_tenant_id();
  IF v_caller_tenant IS NOT NULL AND p_tenant_id != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'create_job_if_not_exists', 'target_tenant', p_tenant_id));
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;

  -- Verify agent belongs to tenant
  SELECT agent_name, status, scheduling_paused, last_heartbeat 
  INTO v_agent_name, v_agent_status, v_scheduling_paused, v_last_heartbeat
  FROM agents WHERE id = p_agent_id AND tenant_id = p_tenant_id;
  
  IF v_agent_name IS NULL THEN
    RAISE EXCEPTION 'AGENT_NOT_FOUND_OR_TENANT_MISMATCH';
  END IF;
  
  IF v_scheduling_paused THEN RETURN NULL; END IF;
  IF v_agent_status NOT IN ('online', 'idle', 'warning') THEN RETURN NULL; END IF;
  
  v_minutes_since_heartbeat := EXTRACT(EPOCH FROM (now() - v_last_heartbeat)) / 60;
  IF v_minutes_since_heartbeat > 30 THEN RETURN NULL; END IF;
  
  -- Check existing
  SELECT id INTO v_existing_id FROM jobs
  WHERE agent_id = p_agent_id AND job_type = p_job_type AND tenant_id = p_tenant_id
    AND status IN ('pending', 'queued', 'assigned', 'delivered', 'in_progress')
  LIMIT 1;
  
  IF v_existing_id IS NOT NULL THEN RETURN v_existing_id; END IF;
  
  v_effective_timeout := LEAST(p_timeout_seconds, 600);
  
  INSERT INTO jobs (agent_id, job_type, tenant_id, priority, payload, max_retries, timeout_seconds, status, created_at)
  VALUES (p_agent_id, p_job_type, p_tenant_id, p_priority, p_payload, p_max_retries, v_effective_timeout, 'pending', now())
  RETURNING id INTO v_new_id;
  
  RETURN v_new_id;
END;
$$;
