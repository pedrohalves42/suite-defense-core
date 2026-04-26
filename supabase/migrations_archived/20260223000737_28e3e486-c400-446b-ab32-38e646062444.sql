
-- =============================================================================
-- PSIA FIX RETRY: Tenant guards for hard_delete_agent, enter_autonomous_safe_mode,
-- finalize_job_execution, get_agent_disk_details
-- =============================================================================

-- V-001: hard_delete_agent
CREATE OR REPLACE FUNCTION public.hard_delete_agent(p_agent_id uuid)
RETURNS json
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_can_delete JSON;
  v_agent RECORD;
  v_caller_tenant uuid;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  SELECT id, agent_name, tenant_id INTO v_agent FROM agents WHERE id = p_agent_id;
  IF v_agent.id IS NULL THEN
    RETURN json_build_object('success', false, 'error', 'AGENT_NOT_FOUND');
  END IF;
  IF v_caller_tenant IS NOT NULL AND v_agent.tenant_id != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'hard_delete_agent', 'target_agent', p_agent_id, 'target_tenant', v_agent.tenant_id));
    RETURN json_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;
  v_can_delete := can_hard_delete_agent(p_agent_id);
  IF NOT (v_can_delete->>'can_delete')::BOOLEAN THEN RETURN v_can_delete; END IF;
  DELETE FROM agent_certificates WHERE agent_id = p_agent_id;
  DELETE FROM agent_disk_metrics WHERE agent_id = p_agent_id;
  DELETE FROM agent_network_metrics WHERE agent_id = p_agent_id;
  DELETE FROM agent_network_info WHERE agent_id = p_agent_id;
  DELETE FROM agent_processes WHERE agent_id = p_agent_id;
  DELETE FROM agent_file_integrity WHERE agent_id = p_agent_id;
  DELETE FROM agent_behavioral_baseline WHERE agent_id = p_agent_id;
  DELETE FROM agent_quarantine WHERE agent_id = p_agent_id;
  DELETE FROM agent_signing_keys WHERE agent_id = p_agent_id;
  DELETE FROM agent_tokens WHERE agent_id = p_agent_id;
  DELETE FROM agent_archive_events WHERE agent_id = p_agent_id;
  DELETE FROM agent_builds WHERE agent_id = p_agent_id;
  DELETE FROM job_executions WHERE agent_id = p_agent_id;
  DELETE FROM jobs WHERE agent_id = p_agent_id;
  DELETE FROM agents WHERE id = p_agent_id;
  RETURN json_build_object('success', true, 'deleted_agent', v_agent.agent_name);
END;
$$;

-- V-002: enter_autonomous_safe_mode
CREATE OR REPLACE FUNCTION public.enter_autonomous_safe_mode(p_agent_id uuid, p_reason text DEFAULT 'autonomous_detection')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_agent_name TEXT; v_tenant_id UUID; v_agent_version TEXT; v_caller_tenant uuid;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  SELECT agent_name, tenant_id, agent_version INTO v_agent_name, v_tenant_id, v_agent_version
  FROM agents WHERE id = p_agent_id;
  IF v_agent_name IS NULL THEN RETURN jsonb_build_object('success', false, 'error', 'Agent not found'); END IF;
  IF v_caller_tenant IS NOT NULL AND v_tenant_id != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'enter_autonomous_safe_mode', 'target_agent', p_agent_id));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;
  UPDATE agents SET agent_mode = 'SAFE_MODE', safe_mode_entered_at = now(), safe_mode_reason = p_reason
  WHERE id = p_agent_id;
  INSERT INTO agent_evidence_logs (agent_id, agent_name, tenant_id, event_type, event_data, evidence_hash, severity)
  VALUES (p_agent_id, v_agent_name, v_tenant_id, 'safe_mode_entry',
    jsonb_build_object('reason', p_reason, 'agent_version', v_agent_version, 'timestamp', now()),
    encode(digest(p_agent_id::text || 'safe_mode' || now()::text, 'sha256'), 'hex'), 'high');
  RETURN jsonb_build_object('success', true, 'agent', v_agent_name, 'mode', 'SAFE_MODE');
END;
$$;

-- V-004: finalize_job_execution
CREATE OR REPLACE FUNCTION public.finalize_job_execution(p_execution_id uuid, p_agent_id uuid, p_status text, p_exit_code integer DEFAULT NULL, p_output text DEFAULT NULL, p_error_message text DEFAULT NULL)
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
      jsonb_build_object('function', 'finalize_job_execution', 'target_agent', p_agent_id));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;
  SELECT * INTO v_execution FROM job_executions WHERE id = p_execution_id AND agent_id = p_agent_id FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'EXECUTION_NOT_FOUND'; END IF;
  IF v_execution.status IN ('completed', 'failed', 'cancelled', 'done') THEN
    RETURN jsonb_build_object('success', true, 'message', 'Already finalized', 'status', v_execution.status);
  END IF;
  UPDATE job_executions SET status = p_status, exit_code = p_exit_code, output = p_output,
    error_message = p_error_message, completed_at = now() WHERE id = p_execution_id;
  UPDATE jobs SET status = CASE WHEN p_status = 'completed' THEN 'completed' ELSE 'failed' END,
    completed_at = now() WHERE id = v_execution.job_id AND status NOT IN ('completed', 'failed', 'cancelled');
  RETURN jsonb_build_object('success', true, 'status', p_status);
END;
$$;

-- V-005: get_agent_disk_details
CREATE OR REPLACE FUNCTION public.get_agent_disk_details(p_agent_id uuid)
RETURNS TABLE(drive_letter text, drive_label text, drive_type text, total_gb numeric, used_gb numeric, free_gb numeric, usage_percent numeric, is_system_drive boolean, collected_at timestamptz)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant uuid; v_agent_tenant uuid;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  SELECT tenant_id INTO v_agent_tenant FROM agents WHERE id = p_agent_id;
  IF v_caller_tenant IS NOT NULL AND v_agent_tenant IS NOT NULL AND v_agent_tenant != v_caller_tenant AND NOT is_current_super_admin() THEN
    INSERT INTO security_logs (tenant_id, event_type, severity, details)
    VALUES (v_caller_tenant, 'cross_tenant_blocked', 'critical',
      jsonb_build_object('function', 'get_agent_disk_details', 'target_agent', p_agent_id));
    RETURN;
  END IF;
  RETURN QUERY
  SELECT DISTINCT ON (dm.drive_letter) dm.drive_letter, dm.drive_label, dm.drive_type,
    dm.total_gb, dm.used_gb, dm.free_gb, dm.usage_percent, dm.is_system_drive, dm.collected_at
  FROM agent_disk_metrics dm WHERE dm.agent_id = p_agent_id ORDER BY dm.drive_letter, dm.collected_at DESC;
END;
$$;
