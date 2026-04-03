
-- Revoke PUBLIC (default) and re-grant only to authenticated + service_role
-- This is required because REVOKE FROM anon doesn't work when inherited from PUBLIC

DO $$
DECLARE
  fn_oid oid;
  fn_sig text;
BEGIN
  FOR fn_oid, fn_sig IN
    SELECT p.oid, 
           'public.' || p.proname || '(' || pg_get_function_identity_arguments(p.oid) || ')'
    FROM pg_proc p
    JOIN pg_namespace n ON p.pronamespace = n.oid
    WHERE p.prosecdef = true AND n.nspname = 'public'
    AND p.prorettype != 'trigger'::regtype
    AND p.proname IN (
      'aggregate_honeypot_hourly','aggregate_honeypot_hourly_stats',
      'audit_credential_rotation','cleanup_expired_cache',
      'cleanup_honeypot_old_data','cleanup_honeypot_rate_data',
      'create_monthly_partitions','create_telemetry_partitions',
      'drop_old_partitions','drop_old_telemetry_partitions',
      'ensure_partition_rls','maintain_partitions','run_partition_maintenance',
      'migrate_telemetry_batch','invalidate_cache_prefix','set_cached_value',
      'run_integrity_sentinel','generate_scim_api_key',
      'get_agent_network_events','get_agent_processes','get_autonomy_metrics',
      'get_cached_value','get_decision_timeline','get_honeypot_stats',
      'get_pending_events','get_trace_timeline','check_honeypot_rate_limit_v2',
      'is_feature_enabled','is_table_migrated','is_tenant_admin',
      'validate_audit_trail_integrity','verify_evidence_log_chain','verify_security_log_chain'
    )
  LOOP
    EXECUTE format('REVOKE EXECUTE ON FUNCTION %s FROM PUBLIC', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO authenticated', fn_sig);
    EXECUTE format('GRANT EXECUTE ON FUNCTION %s TO service_role', fn_sig);
  END LOOP;
END;
$$;
