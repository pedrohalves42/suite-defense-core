
-- PSIA: Drop and recreate finalize_job_execution full overload, then other overloads
DROP FUNCTION IF EXISTS public.finalize_job_execution(uuid,uuid,uuid,text,timestamptz,timestamptz,text,text,numeric,text,boolean,text,text,bigint);

CREATE OR REPLACE FUNCTION public.finalize_job_execution(
  p_execution_id uuid, p_agent_id uuid, p_job_id uuid, p_status text,
  p_started_at timestamptz, p_finished_at timestamptz, p_output_hash text DEFAULT NULL,
  p_error_message text DEFAULT NULL, p_execution_time_seconds numeric DEFAULT NULL,
  p_result_signature text DEFAULT NULL, p_signature_verified boolean DEFAULT NULL,
  p_execution_hash text DEFAULT NULL, p_previous_execution_hash text DEFAULT NULL,
  p_execution_index bigint DEFAULT NULL
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_execution job_executions%ROWTYPE;
  v_caller_tenant uuid; v_agent_tenant uuid;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  SELECT tenant_id INTO v_agent_tenant FROM agents WHERE id = p_agent_id;
  IF v_caller_tenant IS NOT NULL AND v_agent_tenant IS NOT NULL AND v_agent_tenant != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'finalize_job_execution_full', 'target_agent', p_agent_id));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;

  SELECT * INTO v_execution FROM job_executions WHERE id = p_execution_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
  IF v_execution.status IN ('completed', 'failed', 'cancelled', 'done') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already finalized', 'status', v_execution.status);
  END IF;

  UPDATE job_executions SET
    status = p_status, started_at = p_started_at, completed_at = p_finished_at,
    output_hash = p_output_hash, error_message = p_error_message,
    execution_time_seconds = p_execution_time_seconds, result_signature = p_result_signature,
    signature_verified = p_signature_verified, execution_hash = p_execution_hash,
    previous_execution_hash = p_previous_execution_hash, execution_index = p_execution_index
  WHERE id = p_execution_id;

  UPDATE jobs SET status = CASE WHEN p_status = 'completed' THEN 'completed' ELSE 'failed' END,
    completed_at = now() WHERE id = p_job_id AND status NOT IN ('completed', 'failed', 'cancelled');

  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- Now apply the 2 overloads that succeeded in the failed migration
CREATE OR REPLACE FUNCTION public.create_job_if_not_exists(
  p_agent_id uuid, p_tenant_id uuid, p_type text, p_payload jsonb DEFAULT '{}'::jsonb,
  p_priority integer DEFAULT 5, p_ttl_hours integer DEFAULT 24
)
RETURNS uuid
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_existing_id uuid; v_new_id uuid; v_agent_name text; v_agent_status text;
  v_scheduling_paused boolean; v_last_heartbeat timestamptz;
  v_minutes_since_heartbeat integer; v_effective_ttl_hours integer;
  v_is_recovery_job boolean; v_caller_tenant uuid;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  IF v_caller_tenant IS NOT NULL AND p_tenant_id != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'create_job_if_not_exists_v2', 'target_tenant', p_tenant_id));
    RAISE EXCEPTION 'TENANT_MISMATCH';
  END IF;
  v_is_recovery_job := p_type IN ('update_agent', 'reinstall_agent');
  SELECT id INTO v_existing_id FROM jobs
  WHERE agent_id = p_agent_id AND type = p_type AND status IN ('pending', 'queued', 'delivered') LIMIT 1;
  IF v_existing_id IS NOT NULL THEN RETURN NULL; END IF;
  SELECT agent_name, status, scheduling_paused, last_heartbeat
  INTO v_agent_name, v_agent_status, v_scheduling_paused, v_last_heartbeat
  FROM agents WHERE id = p_agent_id;
  IF v_agent_name IS NULL THEN RETURN NULL; END IF;
  IF v_scheduling_paused = true AND NOT v_is_recovery_job THEN RETURN NULL; END IF;
  IF v_agent_status = 'inactive' AND NOT v_is_recovery_job THEN RETURN NULL; END IF;
  v_effective_ttl_hours := p_ttl_hours;
  IF v_last_heartbeat IS NOT NULL THEN
    v_minutes_since_heartbeat := EXTRACT(EPOCH FROM (now() - v_last_heartbeat))::integer / 60;
    IF v_minutes_since_heartbeat > 60 AND NOT v_is_recovery_job THEN RETURN NULL; END IF;
    IF v_minutes_since_heartbeat > 30 AND v_effective_ttl_hours > 2 THEN v_effective_ttl_hours := 2; END IF;
  END IF;
  INSERT INTO jobs (agent_id, tenant_id, type, payload, priority, status, approved, expires_at, created_at, agent_name)
  VALUES (p_agent_id, p_tenant_id, p_type, p_payload, p_priority, 'pending', true,
    now() + (v_effective_ttl_hours || ' hours')::interval, now(), v_agent_name)
  RETURNING id INTO v_new_id;
  RETURN v_new_id;
EXCEPTION WHEN unique_violation THEN RETURN NULL;
END;
$$;

CREATE OR REPLACE FUNCTION public.enter_autonomous_safe_mode(p_agent_id uuid, p_reason text, p_failure_type text, p_failure_count integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_name TEXT; v_tenant_id UUID; v_agent_version TEXT; v_event_id UUID; v_caller_tenant uuid;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  SELECT agent_name, tenant_id, agent_version INTO v_agent_name, v_tenant_id, v_agent_version
  FROM agents WHERE id = p_agent_id;
  IF v_agent_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agent not found'); END IF;
  IF v_caller_tenant IS NOT NULL AND v_tenant_id != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'enter_autonomous_safe_mode_v2', 'target_agent', p_agent_id));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;
  UPDATE agents SET agent_mode = 'SAFE_MODE', safe_mode_entered_at = NOW(), safe_mode_reason = p_reason WHERE id = p_agent_id;
  INSERT INTO agent_safe_mode_events (agent_id, tenant_id, entered_at, reason, agent_version, failure_count)
  VALUES (p_agent_id, v_tenant_id, NOW(), p_reason, v_agent_version, p_failure_count) RETURNING id INTO v_event_id;
  INSERT INTO system_alerts (tenant_id, agent_id, alert_type, severity, message, source, details)
  VALUES (v_tenant_id, p_agent_id, 'autonomous_safe_mode', 'high',
    format('Agente %s entrou automaticamente em SAFE_MODE: %s', v_agent_name, p_reason),
    'autonomous_safe_mode_system',
    jsonb_build_object('agent_id', p_agent_id, 'agent_name', v_agent_name, 'failure_type', p_failure_type,
      'failure_count', p_failure_count, 'safe_mode_event_id', v_event_id, 'triggered_at', NOW()));
  INSERT INTO ai_insights (tenant_id, agent_id, insight_type, severity, title, description, recommended_action, data)
  VALUES (v_tenant_id, p_agent_id, 'anomaly', 'high',
    format('SAFE_MODE Autônomo: %s', v_agent_name),
    format('Agente entrou em modo seguro automaticamente após %s falhas (%s)', p_failure_count, p_failure_type),
    'Investigar causa raiz e resetar modo seguro quando estável',
    jsonb_build_object('safe_mode_event_id', v_event_id, 'failure_type', p_failure_type, 'failure_count', p_failure_count));
  RETURN jsonb_build_object('success', true, 'agent', v_agent_name, 'mode', 'SAFE_MODE', 'event_id', v_event_id);
END;
$$;
