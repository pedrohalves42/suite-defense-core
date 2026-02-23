
-- =============================================================================
-- VELLUM V-001 FIX: Mass revoke internal/cron/trigger SECURITY DEFINER 
-- functions from authenticated role
-- These are NOT user-facing RPCs — they should only be callable by postgres/triggers
-- =============================================================================
DO $$
DECLARE
  fn record;
  revoked_count int := 0;
BEGIN
  FOR fn IN
    SELECT p.proname, p.oid,
      pg_get_function_identity_arguments(p.oid) as args
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE n.nspname = 'public' AND p.prosecdef = true
    AND has_function_privilege('authenticated', p.oid, 'EXECUTE')
    AND (
      -- Internal trigger functions
      p.proname LIKE 'auto_%'
      OR p.proname LIKE 'emit_%'
      OR p.proname LIKE 'trg_%'
      -- Cleanup/cron functions
      OR p.proname LIKE 'cleanup_%'
      OR p.proname LIKE 'detect_%'
      OR p.proname LIKE 'sync_%'
      OR p.proname LIKE 'enforce_%'
      OR p.proname LIKE 'prevent_%'
      OR p.proname LIKE 'derive_%'
      -- Internal helpers
      OR p.proname LIKE 'check_and_%'
      OR p.proname LIKE 'calculate_%'
      OR p.proname LIKE 'create_decision_%'
      OR p.proname LIKE 'create_security_%'
      OR p.proname LIKE 'create_task_from_%'
      OR p.proname LIKE 'create_metrics_%'
      OR p.proname LIKE 'create_recurring_%'
      OR p.proname LIKE 'collect_%'
      OR p.proname LIKE 'decrement_%'
      OR p.proname LIKE 'increment_%'
      OR p.proname LIKE 'drop_old_%'
      OR p.proname LIKE 'escalate_%'
      OR p.proname LIKE 'evaluate_%'
      OR p.proname LIKE 'execute_%'
      OR p.proname LIKE 'find_%'
      OR p.proname LIKE 'force_%'
      OR p.proname LIKE 'generate_%'
      OR p.proname LIKE 'invalidate_%'
      OR p.proname LIKE 'log_%'
      OR p.proname LIKE 'normalize_%'
      OR p.proname LIKE 'persist_%'
      OR p.proname LIKE 'process_%'
      OR p.proname LIKE 'redirect_%'
      OR p.proname LIKE 'refresh_%'
      OR p.proname LIKE 'reprocess_%'
      OR p.proname LIKE 'request_%'
      OR p.proname LIKE 'reset_%'
      OR p.proname LIKE 'run_%'
      OR p.proname LIKE 'set_%'
      OR p.proname LIKE 'trigger_%'
      OR p.proname LIKE 'update_%'
      OR p.proname LIKE 'validate_%'
      OR p.proname LIKE 'verify_%'
      OR p.proname IN (
        'ai_validate_action', 'assert_system_allows_jobs', 'assert_system_not_stopped',
        'capture_forensic_snapshot_full', 'classify_software_risk', 
        'count_policies_for_table', 'create_default_subscription',
        'deduplicate_system_alert', 'describe_table',
        'fn_agent_reentry_check', 'fn_alert_agent_reentry',
        'hash_enrollment_key_secure', 'hmac_signatures_delete_trigger',
        'hmac_signatures_insert_trigger', 'require_key_hash',
        'check_approval_complete', 'check_incident_slo_task',
        'check_installation_failure_rate', 'check_job_health_anomalies_and_alert',
        'check_job_quota', 'check_offline_agents_for_playbook',
        'check_quota_threshold', 'check_segregation_rule',
        'check_super_admin_ip_access', 'check_task_sla_breach',
        'check_action_rate_limit', 'check_ai_circuit_breaker'
      )
    )
    -- PRESERVE user-facing RPCs
    AND p.proname NOT IN (
      'get_active_tenant_id', 'get_user_roles', 'has_role', 
      'is_super_admin', 'is_operator_or_viewer', 'is_break_glass_user',
      'is_emergency_mode', 'get_system_mode', 'get_system_mode_safe',
      'get_session_timeout_minutes', 'get_tenant_mfa_policy',
      'must_change_password', 'user_belongs_to_tenant',
      'switch_tenant_atomic', 'handle_new_user', 'test_tenant_isolation',
      'poll_jobs_v2', 'get_enrollment_key_full',
      'get_agents_list', 'get_agent_health_metrics',
      'get_latest_agent_metrics', 'get_critical_insights_count',
      'get_governance_snapshot', 'get_ai_provider_scores',
      'get_balanced_pending_actions', 'get_alert_decision_chain',
      'get_autonomy_metrics', 'get_audit_raw_metrics',
      'get_mfa_user_count', 'diagnose_agent_issues',
      'ensure_tenant_features', 'create_jobs_for_all_agents',
      'get_decision_timeline'
    )
  LOOP
    BEGIN
      EXECUTE format('REVOKE EXECUTE ON FUNCTION public.%I(%s) FROM authenticated, anon, public', fn.proname, fn.args);
      revoked_count := revoked_count + 1;
    EXCEPTION WHEN OTHERS THEN
      RAISE WARNING 'Failed to revoke %: %', fn.proname, SQLERRM;
    END;
  END LOOP;
  RAISE NOTICE 'Revoked % internal functions from authenticated', revoked_count;
END $$;
