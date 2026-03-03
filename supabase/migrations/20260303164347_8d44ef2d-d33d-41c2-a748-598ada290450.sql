
-- ============================================================
-- P0: CIRCUIT BREAKER GLOBAL + TENANT COOLDOWN + RATE LIMITS
-- P1: SOAR PLAYBOOK VERSIONING + DRY-RUN / OBSERVATION MODE
-- ============================================================

-- 1. Global Fleet Circuit Breaker RPC
-- Pauses ALL automation for a tenant if >X% of fleet is impacted in Y minutes
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
  -- Count total active agents
  SELECT count(*) INTO v_total_agents
  FROM agents
  WHERE tenant_id = p_tenant_id AND archived_at IS NULL;

  IF v_total_agents = 0 THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'no_agents');
  END IF;

  -- Count distinct agents impacted by automation in the window
  SELECT count(DISTINCT agent_id) INTO v_impacted_agents
  FROM automation_execution_log
  WHERE tenant_id = p_tenant_id
    AND executed_at >= now() - (p_window_minutes || ' minutes')::interval;

  v_impact_percent := (v_impacted_agents::numeric / v_total_agents) * 100;

  -- Check if tenant has a cooldown active
  SELECT cooldown_until INTO v_cooldown_until
  FROM tenant_automation_state
  WHERE tenant_id = p_tenant_id;

  IF v_cooldown_until IS NOT NULL AND v_cooldown_until > now() THEN
    -- Log the event
    INSERT INTO circuit_breaker_events (service, state, previous_state, reason, triggered_by, failure_count, tenant_id)
    VALUES ('global_automation', 'open', 'closed', 
            format('Cooldown active until %s', v_cooldown_until), 
            'system', v_impacted_agents, p_tenant_id);
    
    RETURN jsonb_build_object(
      'allowed', false,
      'reason', 'tenant_cooldown_active',
      'cooldown_until', v_cooldown_until,
      'impact_percent', v_impact_percent
    );
  END IF;

  -- Check if impact exceeds threshold
  IF v_impact_percent >= p_max_impact_percent THEN
    v_is_open := true;
    
    -- Auto-set cooldown (15 min)
    INSERT INTO tenant_automation_state (tenant_id, cooldown_until, last_breaker_trip, trip_reason)
    VALUES (p_tenant_id, now() + interval '15 minutes', now(), 
            format('Impact %s%% >= threshold %s%%', round(v_impact_percent, 1), p_max_impact_percent))
    ON CONFLICT (tenant_id) DO UPDATE SET
      cooldown_until = now() + interval '15 minutes',
      last_breaker_trip = now(),
      trip_reason = format('Impact %s%% >= threshold %s%%', round(v_impact_percent, 1), p_max_impact_percent);

    -- Log the event
    INSERT INTO circuit_breaker_events (service, state, previous_state, reason, triggered_by, failure_count, tenant_id)
    VALUES ('global_automation', 'open', 'closed',
            format('Fleet impact %s%% exceeds %s%% threshold (%s/%s agents)', 
                   round(v_impact_percent, 1), p_max_impact_percent, v_impacted_agents, v_total_agents),
            'auto_breaker', v_impacted_agents, p_tenant_id);
  END IF;

  RETURN jsonb_build_object(
    'allowed', NOT v_is_open,
    'impact_percent', round(v_impact_percent, 1),
    'impacted_agents', v_impacted_agents,
    'total_agents', v_total_agents,
    'threshold', p_max_impact_percent,
    'state', CASE WHEN v_is_open THEN 'open' ELSE 'closed' END
  );
END;
$$;

-- 2. Tenant Automation State (cooldown tracking)
CREATE TABLE IF NOT EXISTS public.tenant_automation_state (
  tenant_id uuid PRIMARY KEY REFERENCES public.tenants(id) ON DELETE CASCADE,
  cooldown_until timestamptz,
  last_breaker_trip timestamptz,
  trip_reason text,
  daily_execution_count integer DEFAULT 0,
  daily_execution_reset_at timestamptz DEFAULT now(),
  max_daily_executions integer DEFAULT 500,
  updated_at timestamptz DEFAULT now()
);

ALTER TABLE public.tenant_automation_state ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_automation_state" ON public.tenant_automation_state
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- 3. Recreate check_and_update_circuit_breaker RPC (was missing)
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
  v_allowed boolean := true;
BEGIN
  SELECT circuit_state, circuit_opened_at, circuit_recovery_minutes
  INTO v_rule
  FROM automation_rules WHERE id = p_rule_id;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('allowed', true, 'reason', 'rule_not_found');
  END IF;

  -- If circuit is open, check recovery
  IF v_rule.circuit_state = 'open' THEN
    IF v_rule.circuit_opened_at + (COALESCE(v_rule.circuit_recovery_minutes, p_recovery_minutes) || ' minutes')::interval <= now() THEN
      -- Recovery period passed, half-open
      UPDATE automation_rules SET circuit_state = 'half_open' WHERE id = p_rule_id;
      RETURN jsonb_build_object('allowed', true, 'state', 'half_open', 'reason', 'recovery_period_passed');
    ELSE
      RETURN jsonb_build_object('allowed', false, 'state', 'open',
        'recovery_at', v_rule.circuit_opened_at + (COALESCE(v_rule.circuit_recovery_minutes, p_recovery_minutes) || ' minutes')::interval,
        'failures', 0);
    END IF;
  END IF;

  -- Count recent failures
  SELECT count(*) INTO v_failure_count
  FROM automation_execution_log
  WHERE rule_id = p_rule_id
    AND success = false
    AND executed_at >= now() - (p_window_minutes || ' minutes')::interval;

  IF v_failure_count >= p_threshold THEN
    UPDATE automation_rules SET circuit_state = 'open', circuit_opened_at = now() WHERE id = p_rule_id;
    v_allowed := false;
    
    INSERT INTO circuit_breaker_events (service, state, previous_state, reason, triggered_by, failure_count, tenant_id)
    SELECT 'rule_' || p_rule_id, 'open', COALESCE(v_rule.circuit_state, 'closed'),
           format('%s failures in %s min', v_failure_count, p_window_minutes),
           'auto_breaker', v_failure_count, tenant_id
    FROM automation_rules WHERE id = p_rule_id;
  END IF;

  RETURN jsonb_build_object('allowed', v_allowed, 'state', CASE WHEN v_allowed THEN 'closed' ELSE 'open' END, 'failures', v_failure_count);
END;
$$;

-- 4. Recreate get_adaptive_blast_radius RPC (was missing)
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
  v_is_business_hours boolean;
  v_config record;
BEGIN
  -- Try to get tenant-specific adaptive config
  SELECT * INTO v_config
  FROM adaptive_blast_radius_config
  WHERE tenant_id = p_tenant_id
    AND action_type = p_action_type
    AND severity = p_severity
  LIMIT 1;

  IF FOUND THEN
    -- Check if within business hours
    v_is_business_hours := (
      extract(dow FROM now()) = ANY(v_config.business_days)
      AND now()::time BETWEEN v_config.business_hours_start::time AND v_config.business_hours_end::time
    );
    
    v_max_percent := CASE WHEN v_is_business_hours 
      THEN v_config.business_hours_max_percent 
      ELSE v_config.off_hours_max_percent END;
  ELSE
    -- Default blast radius by severity
    v_max_percent := CASE p_severity
      WHEN 'critical' THEN 80
      WHEN 'high' THEN 50
      WHEN 'medium' THEN 30
      WHEN 'low' THEN 15
      ELSE 30
    END;
    
    -- Reduce for destructive actions during any hours
    IF p_action_type IN ('delete', 'quarantine_file', 'kill_process') THEN
      v_max_percent := v_max_percent * 0.5;
    END IF;
  END IF;

  RETURN v_max_percent;
END;
$$;

-- 5. Tenant Daily Quota Check RPC
CREATE OR REPLACE FUNCTION public.check_tenant_automation_quota(
  p_tenant_id uuid
)
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
  -- Get or create state
  INSERT INTO tenant_automation_state (tenant_id) VALUES (p_tenant_id)
  ON CONFLICT (tenant_id) DO NOTHING;
  
  SELECT * INTO v_state FROM tenant_automation_state WHERE tenant_id = p_tenant_id;
  v_max := COALESCE(v_state.max_daily_executions, 500);
  
  -- Reset daily counter if past reset time
  IF v_state.daily_execution_reset_at < date_trunc('day', now()) THEN
    UPDATE tenant_automation_state 
    SET daily_execution_count = 0, daily_execution_reset_at = now()
    WHERE tenant_id = p_tenant_id;
    v_today_count := 0;
  ELSE
    v_today_count := COALESCE(v_state.daily_execution_count, 0);
  END IF;

  RETURN jsonb_build_object(
    'allowed', v_today_count < v_max,
    'current', v_today_count,
    'max', v_max,
    'remaining', GREATEST(v_max - v_today_count, 0)
  );
END;
$$;

-- 6. Increment tenant daily quota counter
CREATE OR REPLACE FUNCTION public.increment_tenant_quota(p_tenant_id uuid)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO tenant_automation_state (tenant_id, daily_execution_count, daily_execution_reset_at)
  VALUES (p_tenant_id, 1, now())
  ON CONFLICT (tenant_id) DO UPDATE SET
    daily_execution_count = tenant_automation_state.daily_execution_count + 1,
    updated_at = now();
END;
$$;

-- 7. SOAR Playbook Versioning Table
CREATE TABLE IF NOT EXISTS public.soar_playbook_versions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  playbook_id uuid NOT NULL REFERENCES public.soar_playbooks(id) ON DELETE CASCADE,
  tenant_id uuid REFERENCES public.tenants(id) ON DELETE CASCADE,
  version integer NOT NULL DEFAULT 1,
  config_snapshot jsonb NOT NULL,
  changed_by uuid,
  change_reason text,
  diff_summary text,
  created_at timestamptz DEFAULT now(),
  UNIQUE(playbook_id, version)
);

ALTER TABLE public.soar_playbook_versions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_playbook_versions" ON public.soar_playbook_versions
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()));

-- 8. Add observation mode columns to soar_playbooks
ALTER TABLE public.soar_playbooks 
  ADD COLUMN IF NOT EXISTS mode text DEFAULT 'active',
  ADD COLUMN IF NOT EXISTS observe_only_until timestamptz,
  ADD COLUMN IF NOT EXISTS dry_run boolean DEFAULT false,
  ADD COLUMN IF NOT EXISTS current_version integer DEFAULT 1;

-- 9. Auto-version trigger on soar_playbooks update
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
  -- Only version on meaningful changes
  IF OLD.name = NEW.name AND OLD.trigger_type = NEW.trigger_type 
     AND OLD.trigger_conditions = NEW.trigger_conditions 
     AND OLD.actions = NEW.actions 
     AND OLD.is_active = NEW.is_active
     AND OLD.auto_execute IS NOT DISTINCT FROM NEW.auto_execute THEN
    RETURN NEW;
  END IF;

  SELECT COALESCE(max(version), 0) + 1 INTO v_next_version
  FROM soar_playbook_versions WHERE playbook_id = NEW.id;

  -- Build diff summary
  v_diff := '';
  IF OLD.name <> NEW.name THEN v_diff := v_diff || 'name changed; '; END IF;
  IF OLD.trigger_type <> NEW.trigger_type THEN v_diff := v_diff || 'trigger_type changed; '; END IF;
  IF OLD.trigger_conditions <> NEW.trigger_conditions THEN v_diff := v_diff || 'trigger_conditions changed; '; END IF;
  IF OLD.actions <> NEW.actions THEN v_diff := v_diff || 'actions changed; '; END IF;
  IF OLD.is_active <> NEW.is_active THEN v_diff := v_diff || format('is_active: %s→%s; ', OLD.is_active, NEW.is_active); END IF;

  INSERT INTO soar_playbook_versions (playbook_id, tenant_id, version, config_snapshot, changed_by, diff_summary)
  VALUES (NEW.id, NEW.tenant_id, v_next_version,
    jsonb_build_object(
      'name', OLD.name,
      'trigger_type', OLD.trigger_type,
      'trigger_conditions', OLD.trigger_conditions,
      'actions', OLD.actions,
      'is_active', OLD.is_active,
      'auto_execute', OLD.auto_execute,
      'requires_approval', OLD.requires_approval,
      'cooldown_minutes', OLD.cooldown_minutes
    ),
    NULLIF(current_setting('request.jwt.claims', true)::jsonb->>'sub', '')::uuid,
    v_diff
  );

  NEW.current_version := v_next_version;
  NEW.updated_at := now();
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_version_soar_playbook ON soar_playbooks;
CREATE TRIGGER trg_version_soar_playbook
  BEFORE UPDATE ON soar_playbooks
  FOR EACH ROW
  EXECUTE FUNCTION trg_version_soar_playbook();

-- 10. Rollback playbook to specific version
CREATE OR REPLACE FUNCTION public.rollback_soar_playbook(
  p_playbook_id uuid,
  p_target_version integer
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_snapshot jsonb;
  v_tenant_id uuid;
BEGIN
  SELECT config_snapshot, tenant_id INTO v_snapshot, v_tenant_id
  FROM soar_playbook_versions
  WHERE playbook_id = p_playbook_id AND version = p_target_version;

  IF NOT FOUND THEN
    RETURN jsonb_build_object('success', false, 'error', 'Version not found');
  END IF;

  -- Apply snapshot (this will trigger versioning of the current state)
  UPDATE soar_playbooks SET
    name = COALESCE(v_snapshot->>'name', name),
    trigger_type = COALESCE(v_snapshot->>'trigger_type', trigger_type),
    trigger_conditions = COALESCE(v_snapshot->'trigger_conditions', trigger_conditions),
    actions = COALESCE(v_snapshot->'actions', actions),
    is_active = COALESCE((v_snapshot->>'is_active')::boolean, is_active),
    auto_execute = COALESCE((v_snapshot->>'auto_execute')::boolean, auto_execute),
    requires_approval = COALESCE((v_snapshot->>'requires_approval')::boolean, requires_approval),
    cooldown_minutes = COALESCE((v_snapshot->>'cooldown_minutes')::integer, cooldown_minutes)
  WHERE id = p_playbook_id AND tenant_id = v_tenant_id;

  RETURN jsonb_build_object('success', true, 'rolled_back_to', p_target_version);
END;
$$;

-- 11. Dry-run impact preview RPC
CREATE OR REPLACE FUNCTION public.preview_automation_impact(
  p_rule_id uuid,
  p_tenant_id uuid
)
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
  IF NOT FOUND THEN
    RETURN jsonb_build_object('error', 'Rule not found');
  END IF;

  -- Total agents
  SELECT count(*) INTO v_total_agents
  FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL;

  -- Matching agents (based on scope)
  IF v_rule.target_scope = 'all_agents' THEN
    v_matching_agents := v_total_agents;
    SELECT jsonb_agg(jsonb_build_object('id', id, 'name', agent_name, 'status', status))
    INTO v_agent_list
    FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL;
  ELSE
    SELECT count(*), jsonb_agg(jsonb_build_object('id', id, 'name', agent_name, 'status', status))
    INTO v_matching_agents, v_agent_list
    FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND id = ANY(v_rule.target_ids);
  END IF;

  -- Recent executions (last 24h)
  SELECT count(*) INTO v_recent_executions
  FROM automation_execution_log
  WHERE rule_id = p_rule_id AND tenant_id = p_tenant_id
    AND executed_at >= now() - interval '24 hours';

  RETURN jsonb_build_object(
    'rule_name', v_rule.name,
    'action_type', v_rule.action_type,
    'mode', v_rule.mode,
    'dry_run', v_rule.dry_run,
    'total_agents', v_total_agents,
    'matching_agents', v_matching_agents,
    'impact_percent', CASE WHEN v_total_agents > 0 THEN round((v_matching_agents::numeric / v_total_agents) * 100, 1) ELSE 0 END,
    'recent_executions_24h', v_recent_executions,
    'rate_limit', v_rule.max_executions_per_hour,
    'cooldown_minutes', v_rule.cooldown_minutes,
    'circuit_state', v_rule.circuit_state,
    'affected_agents', COALESCE(v_agent_list, '[]'::jsonb)
  );
END;
$$;

-- 12. Grant permissions
GRANT EXECUTE ON FUNCTION public.check_global_circuit_breaker(uuid, numeric, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_and_update_circuit_breaker(uuid, integer, integer, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.get_adaptive_blast_radius(uuid, text, text) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.check_tenant_automation_quota(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.increment_tenant_quota(uuid) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.rollback_soar_playbook(uuid, integer) TO authenticated, service_role;
GRANT EXECUTE ON FUNCTION public.preview_automation_impact(uuid, uuid) TO authenticated, service_role;

-- Revoke from public/anon
REVOKE EXECUTE ON FUNCTION public.check_global_circuit_breaker(uuid, numeric, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_and_update_circuit_breaker(uuid, integer, integer, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.get_adaptive_blast_radius(uuid, text, text) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.check_tenant_automation_quota(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.increment_tenant_quota(uuid) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.rollback_soar_playbook(uuid, integer) FROM public, anon;
REVOKE EXECUTE ON FUNCTION public.preview_automation_impact(uuid, uuid) FROM public, anon;
