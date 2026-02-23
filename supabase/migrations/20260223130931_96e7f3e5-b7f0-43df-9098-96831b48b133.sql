
-- ================================================================
-- MIGRATION: Resolve 4 Non-Blocking Scale Risks (v2)
-- ================================================================

-- 1. PERFORMANCE METRICS: Indexes + retention function
CREATE OR REPLACE FUNCTION public.cleanup_performance_metrics_monthly()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT is_current_super_admin() THEN
    RAISE EXCEPTION 'Unauthorized: super_admin required';
  END IF;
  DELETE FROM performance_metrics WHERE created_at < NOW() - INTERVAL '90 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN jsonb_build_object('deleted_rows', v_deleted, 'retention_days', 90, 'executed_at', NOW());
END;
$$;

CREATE INDEX IF NOT EXISTS idx_performance_metrics_created_at ON performance_metrics (created_at);
CREATE INDEX IF NOT EXISTS idx_performance_metrics_function_duration ON performance_metrics (function_name, duration_ms) WHERE duration_ms > 2000;

-- 2. SOAR ENGINE: Connect system_alerts -> soar_playbooks -> soar_executions
CREATE OR REPLACE FUNCTION public.soar_evaluate_alert()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_playbook RECORD;
  v_trigger_type text;
BEGIN
  v_trigger_type := CASE NEW.alert_type
    WHEN 'vulnerability_critical' THEN 'vulnerability_critical'
    WHEN 'antivirus_outdated' THEN 'antivirus_outdated'
    WHEN 'certificate_expiring' THEN 'certificate_expiring'
    WHEN 'usb_device_risky' THEN 'usb_device_risky'
    WHEN 'process_suspicious' THEN 'process_suspicious'
    WHEN 'behavioral_anomaly' THEN 'behavioral_anomaly'
    WHEN 'agent_compromised' THEN 'behavioral_anomaly'
    WHEN 'ai_insight_alert' THEN 'behavioral_anomaly'
    ELSE NULL
  END;

  IF v_trigger_type IS NULL THEN RETURN NEW; END IF;

  SELECT * INTO v_playbook FROM soar_playbooks
  WHERE trigger_type = v_trigger_type AND is_active = true
    AND (tenant_id = NEW.tenant_id OR tenant_id IS NOT NULL)
    AND (last_triggered_at IS NULL OR last_triggered_at < NOW() - (cooldown_minutes || ' minutes')::interval)
  ORDER BY CASE WHEN tenant_id = NEW.tenant_id THEN 0 ELSE 1 END
  LIMIT 1;

  IF v_playbook IS NOT NULL THEN
    INSERT INTO soar_executions (
      id, tenant_id, playbook_id, trigger_type, agent_id, status, actions_taken, started_at, created_at
    ) VALUES (
      gen_random_uuid(), NEW.tenant_id, v_playbook.id, v_trigger_type, NEW.agent_id,
      CASE WHEN v_playbook.auto_execute AND NOT v_playbook.requires_approval THEN 'running' ELSE 'pending_approval' END,
      v_playbook.actions, NOW(), NOW()
    );
    UPDATE soar_playbooks SET last_triggered_at = NOW(), execution_count = execution_count + 1 WHERE id = v_playbook.id;
  END IF;

  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS trg_soar_evaluate_alert ON system_alerts;
CREATE TRIGGER trg_soar_evaluate_alert
  AFTER INSERT ON system_alerts
  FOR EACH ROW
  WHEN (NEW.resolved = false)
  EXECUTE FUNCTION soar_evaluate_alert();

-- 3. SECURITY_LOGS: Helper function for cross-tenant violation logging
CREATE OR REPLACE FUNCTION public.log_security_violation(
  p_tenant_id uuid, p_user_id uuid, p_ip_address text,
  p_endpoint text, p_attack_type text, p_severity text DEFAULT 'high',
  p_details jsonb DEFAULT '{}'
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  INSERT INTO security_logs (tenant_id, user_id, ip_address, endpoint, attack_type, severity, blocked, details)
  VALUES (p_tenant_id, p_user_id, COALESCE(p_ip_address, 'unknown'), p_endpoint, p_attack_type, p_severity, true, p_details);
EXCEPTION WHEN OTHERS THEN
  RAISE WARNING 'Failed to log security violation: %', SQLERRM;
END;
$$;

-- 4. V-302: Tenant guards on critical write RPCs

-- 4a. update_user_role - CRITICAL privilege escalation vector
CREATE OR REPLACE FUNCTION public.update_user_role(p_user_id uuid, p_role text, p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_id uuid;
  v_caller_tenant uuid;
BEGIN
  v_caller_id := auth.uid();
  IF v_caller_id IS NULL THEN
    RETURN jsonb_build_object('success', false, 'error', 'NOT_AUTHENTICATED');
  END IF;

  v_caller_tenant := get_active_tenant_id();
  IF v_caller_tenant IS NULL OR v_caller_tenant != p_tenant_id THEN
    PERFORM log_security_violation(p_tenant_id, v_caller_id, 'internal', 'update_user_role', 'cross_tenant_privilege_escalation', 'critical',
      jsonb_build_object('target_user', p_user_id, 'target_role', p_role, 'caller_tenant', v_caller_tenant));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;

  IF NOT EXISTS (SELECT 1 FROM user_roles WHERE user_id = v_caller_id AND tenant_id = p_tenant_id AND role IN ('admin', 'super_admin')) THEN
    PERFORM log_security_violation(p_tenant_id, v_caller_id, 'internal', 'update_user_role', 'privilege_escalation_attempt', 'high',
      jsonb_build_object('target_user', p_user_id, 'target_role', p_role));
    RETURN jsonb_build_object('success', false, 'error', 'INSUFFICIENT_PRIVILEGES');
  END IF;

  IF v_caller_id = p_user_id AND p_role = 'super_admin' THEN
    RETURN jsonb_build_object('success', false, 'error', 'SELF_ESCALATION_BLOCKED');
  END IF;

  INSERT INTO user_roles (user_id, role, tenant_id)
  VALUES (p_user_id, p_role::app_role, p_tenant_id)
  ON CONFLICT (user_id, tenant_id) DO UPDATE SET role = p_role::app_role;

  RETURN jsonb_build_object('success', true, 'user_id', p_user_id, 'new_role', p_role);
END;
$$;

-- 4b. reactivate_tenant - super_admin only with logging
CREATE OR REPLACE FUNCTION public.reactivate_tenant(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NOT is_current_super_admin() THEN
    PERFORM log_security_violation(p_tenant_id, auth.uid(), 'internal', 'reactivate_tenant', 'unauthorized_tenant_reactivation', 'critical',
      jsonb_build_object('target_tenant', p_tenant_id));
    RAISE EXCEPTION 'Only super_admin can reactivate tenants';
  END IF;

  UPDATE tenants SET status = 'active', suspended_at = NULL, suspension_reason = NULL
  WHERE id = p_tenant_id AND status = 'suspended';

  RETURN jsonb_build_object('success', true, 'tenant_id', p_tenant_id);
END;
$$;

-- 4c. cleanup_orphaned_agents - keep original return type (integer), add guard
DROP FUNCTION IF EXISTS public.cleanup_orphaned_agents();
CREATE OR REPLACE FUNCTION public.cleanup_orphaned_agents()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_deleted integer;
BEGIN
  IF NOT is_current_super_admin() THEN
    PERFORM log_security_violation(NULL, auth.uid(), 'internal', 'cleanup_orphaned_agents', 'unauthorized_cleanup', 'high', '{}'::jsonb);
    RAISE EXCEPTION 'Only super_admin can cleanup orphaned agents';
  END IF;

  DELETE FROM agents WHERE tenant_id IS NULL AND created_at < NOW() - INTERVAL '7 days';
  GET DIAGNOSTICS v_deleted = ROW_COUNT;
  RETURN v_deleted;
END;
$$;

-- 4d. evaluate_decision_rules - add tenant validation
CREATE OR REPLACE FUNCTION public.evaluate_decision_rules(p_tenant_id uuid, p_context jsonb DEFAULT '{}')
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_caller_tenant uuid;
  v_results jsonb;
BEGIN
  v_caller_tenant := get_active_tenant_id();
  IF v_caller_tenant IS NOT NULL AND v_caller_tenant != p_tenant_id AND NOT is_current_super_admin() THEN
    PERFORM log_security_violation(p_tenant_id, auth.uid(), 'internal', 'evaluate_decision_rules', 'cross_tenant_rule_evaluation', 'high',
      jsonb_build_object('caller_tenant', v_caller_tenant, 'target_tenant', p_tenant_id));
    RETURN jsonb_build_object('success', false, 'error', 'TENANT_MISMATCH');
  END IF;

  SELECT jsonb_agg(jsonb_build_object('rule_id', id, 'name', name, 'action', action_type))
  INTO v_results
  FROM automation_rules WHERE tenant_id = p_tenant_id AND is_active = true AND mode = 'active';

  RETURN jsonb_build_object('success', true, 'rules_evaluated', COALESCE(v_results, '[]'::jsonb));
END;
$$;

-- Revoke anon/public, grant authenticated
REVOKE ALL ON FUNCTION public.cleanup_performance_metrics_monthly() FROM anon, public;
REVOKE ALL ON FUNCTION public.log_security_violation(uuid, uuid, text, text, text, text, jsonb) FROM anon, public;
REVOKE ALL ON FUNCTION public.update_user_role(uuid, text, uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.reactivate_tenant(uuid) FROM anon, public;
REVOKE ALL ON FUNCTION public.cleanup_orphaned_agents() FROM anon, public;
REVOKE ALL ON FUNCTION public.evaluate_decision_rules(uuid, jsonb) FROM anon, public;

GRANT EXECUTE ON FUNCTION public.update_user_role(uuid, text, uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.reactivate_tenant(uuid) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_orphaned_agents() TO authenticated;
GRANT EXECUTE ON FUNCTION public.evaluate_decision_rules(uuid, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.cleanup_performance_metrics_monthly() TO authenticated;
