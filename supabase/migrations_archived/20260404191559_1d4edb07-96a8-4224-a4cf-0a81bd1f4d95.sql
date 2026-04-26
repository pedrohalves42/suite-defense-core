
-- Drop existing functions with old return types
DROP FUNCTION IF EXISTS public.archive_agent(uuid);
DROP FUNCTION IF EXISTS public.archive_agent(uuid, text, text, uuid, text);
DROP FUNCTION IF EXISTS public.can_hard_delete_agent(uuid);
DROP FUNCTION IF EXISTS public.hard_delete_agent(uuid);

-- 1. archive_agent
CREATE FUNCTION public.archive_agent(p_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_tenant uuid;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;

  v_caller_tenant := public.get_active_tenant_id();
  IF v_caller_tenant IS NULL OR v_caller_tenant <> v_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  UPDATE public.agents
  SET status = 'archived', archived_at = now(), archived_reason = 'user_requested'
  WHERE id = p_agent_id AND tenant_id = v_tenant_id;

  INSERT INTO public.agent_archive_events (agent_id, tenant_id, reason, actor_type, actor_id)
  VALUES (p_agent_id, v_tenant_id, 'user_requested', 'user', auth.uid());

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.archive_agent(uuid) TO authenticated;

-- 2. can_hard_delete_agent
CREATE FUNCTION public.can_hard_delete_agent(p_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_tenant uuid;
  v_latest_evidence timestamptz;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('can_delete', false, 'blocked_until', null);
  END IF;

  v_caller_tenant := public.get_active_tenant_id();
  IF v_caller_tenant IS NULL OR v_caller_tenant <> v_tenant_id THEN
    RETURN jsonb_build_object('can_delete', false, 'blocked_until', null);
  END IF;

  SELECT max(created_at) INTO v_latest_evidence
  FROM public.agent_evidence_logs
  WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;

  IF v_latest_evidence IS NOT NULL AND v_latest_evidence > now() - interval '30 days' THEN
    RETURN jsonb_build_object('can_delete', false, 'blocked_until', v_latest_evidence + interval '30 days');
  END IF;

  RETURN jsonb_build_object('can_delete', true, 'blocked_until', null);
END;
$$;

GRANT EXECUTE ON FUNCTION public.can_hard_delete_agent(uuid) TO authenticated;

-- 3. hard_delete_agent
CREATE FUNCTION public.hard_delete_agent(p_agent_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
  v_caller_tenant uuid;
  v_can_delete jsonb;
BEGIN
  SELECT tenant_id INTO v_tenant_id FROM public.agents WHERE id = p_agent_id;
  IF v_tenant_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'Agent not found');
  END IF;

  v_caller_tenant := public.get_active_tenant_id();
  IF v_caller_tenant IS NULL OR v_caller_tenant <> v_tenant_id THEN
    RETURN jsonb_build_object('success', false, 'error', 'Access denied');
  END IF;

  v_can_delete := public.can_hard_delete_agent(p_agent_id);
  IF NOT (v_can_delete->>'can_delete')::boolean THEN
    RETURN jsonb_build_object('success', false, 'reason', 'AUDIT_RETENTION', 'message', 'Exclusão bloqueada por política de retenção de auditoria (30 dias)');
  END IF;

  DELETE FROM public.agent_disk_metrics WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agent_certificates WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agent_file_integrity WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agent_behavioral_baseline WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agent_archive_events WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agent_evidence_logs WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agent_execution_chain WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agent_builds WHERE agent_id = p_agent_id AND tenant_id = v_tenant_id;
  DELETE FROM public.agents WHERE id = p_agent_id AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object('success', true);
END;
$$;

GRANT EXECUTE ON FUNCTION public.hard_delete_agent(uuid) TO authenticated;
