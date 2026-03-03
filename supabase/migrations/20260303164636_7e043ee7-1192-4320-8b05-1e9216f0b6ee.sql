
-- Recreate RPCs that failed in previous migration

CREATE OR REPLACE FUNCTION public.check_global_circuit_breaker(
  p_tenant_id uuid,
  p_max_impact_percent numeric DEFAULT 30,
  p_window_minutes integer DEFAULT 10
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_total_agents integer;
  v_impacted_agents integer;
  v_impact_percent numeric;
  v_is_open boolean := false;
  v_cooldown_until timestamptz;
BEGIN
  SELECT count(*) INTO v_total_agents FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL;
  IF v_total_agents = 0 THEN RETURN jsonb_build_object('allowed', true, 'reason', 'no_agents'); END IF;

  SELECT count(DISTINCT agent_id) INTO v_impacted_agents
  FROM automation_execution_log
  WHERE tenant_id = p_tenant_id AND executed_at >= now() - make_interval(mins => p_window_minutes);

  v_impact_percent := (v_impacted_agents::numeric / v_total_agents) * 100;

  SELECT cooldown_until INTO v_cooldown_until FROM tenant_automation_state WHERE tenant_id = p_tenant_id;
  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > now() THEN
    RETURN jsonb_build_object('allowed', false, 'reason', 'tenant_cooldown_active', 'cooldown_until', v_cooldown_until, 'impact_percent', v_impact_percent);
  END IF;

  IF v_impact_percent >= p_max_impact_percent THEN
    v_is_open := true;
    INSERT INTO tenant_automation_state (tenant_id, cooldown_until, last_breaker_trip, trip_reason)
    VALUES (p_tenant_id, now() + interval '15 minutes', now(), format('Impact %s%% >= threshold %s%%', round(v_impact_percent, 1), p_max_impact_percent))
    ON CONFLICT (tenant_id) DO UPDATE SET cooldown_until = now() + interval '15 minutes', last_breaker_trip = now(),
      trip_reason = format('Impact %s%% >= threshold %s%%', round(v_impact_percent, 1), p_max_impact_percent);

    INSERT INTO circuit_breaker_events (service, state, previous_state, reason, triggered_by, failure_count, tenant_id)
    VALUES ('global_automation', 'open', 'closed',
      format('Fleet impact %s%% exceeds %s%%', round(v_impact_percent, 1), p_max_impact_percent),
      'auto_breaker', v_impacted_agents, p_tenant_id);
  END IF;

  RETURN jsonb_build_object('allowed', NOT v_is_open, 'impact_percent', round(v_impact_percent, 1),
    'impacted_agents', v_impacted_agents, 'total_agents', v_total_agents, 'threshold', p_max_impact_percent,
    'state', CASE WHEN v_is_open THEN 'open' ELSE 'closed' END);
END;
$$;

CREATE OR REPLACE FUNCTION public.check_and_update_circuit_breaker(
  p_rule_id uuid,
  p_threshold integer DEFAULT 10,
  p_window_minutes integer DEFAULT 5,
  p_recovery_minutes integer DEFAULT 15
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_failure_count integer;
BEGIN
  SELECT circuit_state, circuit_opened_at, circuit_recovery_minutes INTO v_rule FROM automation_rules WHERE id = p_rule_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('allowed', true, 'reason', 'rule_not_found'); END IF;

  IF v_rule.circuit_state = 'open' THEN
    IF v_rule.circuit_opened_at + make_interval(mins => COALESCE(v_rule.circuit_recovery_minutes, p_recovery_minutes)) <= now() THEN
      UPDATE automation_rules SET circuit_state = 'half_open' WHERE id = p_rule_id;
      RETURN jsonb_build_object('allowed', true, 'state', 'half_open');
    ELSE
      RETURN jsonb_build_object('allowed', false, 'state', 'open',
        'recovery_at', v_rule.circuit_opened_at + make_interval(mins => COALESCE(v_rule.circuit_recovery_minutes, p_recovery_minutes)));
    END IF;
  END IF;

  SELECT count(*) INTO v_failure_count FROM automation_execution_log
  WHERE rule_id = p_rule_id AND success = false AND executed_at >= now() - make_interval(mins => p_window_minutes);

  IF v_failure_count >= p_threshold THEN
    UPDATE automation_rules SET circuit_state = 'open', circuit_opened_at = now() WHERE id = p_rule_id;
    INSERT INTO circuit_breaker_events (service, state, previous_state, reason, triggered_by, failure_count, tenant_id)
    SELECT 'rule_' || p_rule_id::text, 'open', COALESCE(v_rule.circuit_state, 'closed'),
      format('%s failures in %s min', v_failure_count, p_window_minutes), 'auto_breaker', v_failure_count, tenant_id
    FROM automation_rules WHERE id = p_rule_id;
    RETURN jsonb_build_object('allowed', false, 'state', 'open', 'failures', v_failure_count);
  END IF;

  RETURN jsonb_build_object('allowed', true, 'state', 'closed', 'failures', v_failure_count);
END;
$$;

CREATE OR REPLACE FUNCTION public.get_adaptive_blast_radius(
  p_tenant_id uuid,
  p_action_type text,
  p_severity text DEFAULT 'medium'
)
RETURNS numeric
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_max_percent numeric;
  v_config record;
  v_is_bh boolean;
BEGIN
  SELECT * INTO v_config FROM adaptive_blast_radius_config
  WHERE tenant_id = p_tenant_id AND action_type = p_action_type AND severity = p_severity LIMIT 1;

  IF FOUND THEN
    v_is_bh := (extract(dow FROM now()) = ANY(v_config.business_days)
      AND now()::time BETWEEN v_config.business_hours_start::time AND v_config.business_hours_end::time);
    v_max_percent := CASE WHEN v_is_bh THEN v_config.business_hours_max_percent ELSE v_config.off_hours_max_percent END;
  ELSE
    v_max_percent := CASE p_severity WHEN 'critical' THEN 80 WHEN 'high' THEN 50 WHEN 'medium' THEN 30 WHEN 'low' THEN 15 ELSE 30 END;
    IF p_action_type IN ('delete', 'quarantine_file', 'kill_process') THEN v_max_percent := v_max_percent * 0.5; END IF;
  END IF;
  RETURN v_max_percent;
END;
$$;

CREATE OR REPLACE FUNCTION public.check_tenant_automation_quota(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_state record;
  v_today_count integer;
  v_max integer;
BEGIN
  INSERT INTO tenant_automation_state (tenant_id) VALUES (p_tenant_id) ON CONFLICT (tenant_id) DO NOTHING;
  SELECT * INTO v_state FROM tenant_automation_state WHERE tenant_id = p_tenant_id;
  v_max := COALESCE(v_state.max_daily_executions, 500);
  IF v_state.daily_execution_reset_at < date_trunc('day', now()) THEN
    UPDATE tenant_automation_state SET daily_execution_count = 0, daily_execution_reset_at = now() WHERE tenant_id = p_tenant_id;
    v_today_count := 0;
  ELSE
    v_today_count := COALESCE(v_state.daily_execution_count, 0);
  END IF;
  RETURN jsonb_build_object('allowed', v_today_count < v_max, 'current', v_today_count, 'max', v_max, 'remaining', GREATEST(v_max - v_today_count, 0));
END;
$$;

CREATE OR REPLACE FUNCTION public.increment_tenant_quota(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tenant_automation_state (tenant_id, daily_execution_count, daily_execution_reset_at)
  VALUES (p_tenant_id, 1, now())
  ON CONFLICT (tenant_id) DO UPDATE SET daily_execution_count = tenant_automation_state.daily_execution_count + 1, updated_at = now();
END;
$$;

CREATE OR REPLACE FUNCTION public.rollback_soar_playbook(p_playbook_id uuid, p_target_version integer)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_tenant_id uuid;
BEGIN
  SELECT config_snapshot, tenant_id INTO v_snapshot, v_tenant_id FROM soar_playbook_versions
  WHERE playbook_id = p_playbook_id AND version = p_target_version;
  IF NOT FOUND THEN RETURN jsonb_build_object('success', false, 'error', 'Version not found'); END IF;

  UPDATE soar_playbooks SET
    name = COALESCE(v_snapshot->>'name', name), trigger_type = COALESCE(v_snapshot->>'trigger_type', trigger_type),
    trigger_conditions = COALESCE(v_snapshot->'trigger_conditions', trigger_conditions),
    actions = COALESCE(v_snapshot->'actions', actions), is_active = COALESCE((v_snapshot->>'is_active')::boolean, is_active),
    auto_execute = COALESCE((v_snapshot->>'auto_execute')::boolean, auto_execute),
    requires_approval = COALESCE((v_snapshot->>'requires_approval')::boolean, requires_approval),
    cooldown_minutes = COALESCE((v_snapshot->>'cooldown_minutes')::integer, cooldown_minutes)
  WHERE id = p_playbook_id AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object('success', true, 'rolled_back_to', p_target_version);
END;
$$;

CREATE OR REPLACE FUNCTION public.preview_automation_impact(p_rule_id uuid, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_rule record;
  v_total_agents integer;
  v_matching_agents integer;
  v_recent_executions integer;
  v_agent_list jsonb;
BEGIN
  SELECT * INTO v_rule FROM automation_rules WHERE id = p_rule_id AND tenant_id = p_tenant_id;
  IF NOT FOUND THEN RETURN jsonb_build_object('error', 'Rule not found'); END IF;

  SELECT count(*) INTO v_total_agents FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL;

  IF v_rule.target_scope = 'all_agents' THEN
    v_matching_agents := v_total_agents;
    SELECT jsonb_agg(jsonb_build_object('id', id, 'name', agent_name, 'status', status))
    INTO v_agent_list FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL;
  ELSE
    SELECT count(*), jsonb_agg(jsonb_build_object('id', id, 'name', agent_name, 'status', status))
    INTO v_matching_agents, v_agent_list FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND id = ANY(v_rule.target_ids);
  END IF;

  SELECT count(*) INTO v_recent_executions FROM automation_execution_log
  WHERE rule_id = p_rule_id AND tenant_id = p_tenant_id AND executed_at >= now() - interval '24 hours';

  RETURN jsonb_build_object('rule_name', v_rule.name, 'action_type', v_rule.action_type, 'mode', v_rule.mode,
    'dry_run', v_rule.dry_run, 'total_agents', v_total_agents, 'matching_agents', v_matching_agents,
    'impact_percent', CASE WHEN v_total_agents > 0 THEN round((v_matching_agents::numeric / v_total_agents) * 100, 1) ELSE 0 END,
    'recent_executions_24h', v_recent_executions, 'rate_limit', v_rule.max_executions_per_hour,
    'cooldown_minutes', v_rule.cooldown_minutes, 'circuit_state', v_rule.circuit_state,
    'affected_agents', COALESCE(v_agent_list, '[]'::jsonb));
END;
$$;

-- Versioning trigger for soar_playbooks
CREATE OR REPLACE FUNCTION public.trg_version_soar_playbook()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_next_version integer;
  v_diff text;
BEGIN
  IF OLD.name = NEW.name AND OLD.trigger_type = NEW.trigger_type 
     AND OLD.trigger_conditions = NEW.trigger_conditions 
     AND OLD.actions = NEW.actions 
     AND OLD.is_active = NEW.is_active
     AND OLD.auto_execute IS NOT DISTINCT FROM NEW.auto_execute THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO v_next_version FROM soar_playbook_versions WHERE playbook_id = NEW.id;

  v_diff := '';
  IF OLD.name <> NEW.name THEN v_diff := v_diff || 'name; '; END IF;
  IF OLD.trigger_type <> NEW.trigger_type THEN v_diff := v_diff || 'trigger_type; '; END IF;
  IF OLD.trigger_conditions <> NEW.trigger_conditions THEN v_diff := v_diff || 'conditions; '; END IF;
  IF OLD.actions <> NEW.actions THEN v_diff := v_diff || 'actions; '; END IF;
  IF OLD.is_active <> NEW.is_active THEN v_diff := v_diff || 'is_active; '; END IF;

  INSERT INTO soar_playbook_versions (playbook_id, tenant_id, version, config_snapshot, diff_summary)
  VALUES (NEW.id, NEW.tenant_id, v_next_version,
    jsonb_build_object('name', OLD.name, 'trigger_type', OLD.trigger_type, 'trigger_conditions', OLD.trigger_conditions,
      'actions', OLD.actions, 'is_active', OLD.is_active, 'auto_execute', OLD.auto_execute,
      'requires_approval', OLD.requires_approval, 'cooldown_minutes', OLD.cooldown_minutes),
    v_diff);

  NEW.current_version := v_next_version;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_version_soar_playbook ON soar_playbooks;
CREATE TRIGGER trg_version_soar_playbook BEFORE UPDATE ON soar_playbooks FOR EACH ROW EXECUTE FUNCTION trg_version_soar_playbook();

-- Grants
GRANT EXECUTE ON FUNCTION public.check_global_circuit_breaker(uuid, numeric, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_update_circuit_breaker(uuid, integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_adaptive_blast_radius(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_tenant_automation_quota(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_tenant_quota(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_soar_playbook(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_automation_impact(uuid, uuid) TO authenticated, service_role;
REVOKE EXECUTE ON FUNCTION public.check_global_circuit_breaker(uuid, numeric, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_and_update_circuit_breaker(uuid, integer, integer, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_adaptive_blast_radius(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_tenant_automation_quota(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.increment_tenant_quota(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.rollback_soar_playbook(uuid, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.preview_automation_impact(uuid, uuid) FROM public, anon;
