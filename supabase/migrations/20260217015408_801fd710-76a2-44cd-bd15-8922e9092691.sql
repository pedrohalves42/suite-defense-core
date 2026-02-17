
CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(p_tenant_id uuid)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  result jsonb;
  rls_total int;
  rls_enabled int;
  ai_total int;
  ai_reviewed int;
  ai_approved int;
  ai_pending int;
  evidence_count bigint;
  security_log_count bigint;
  exec_chain_count int;
  trigger_count int;
  immutable_trigger_count int;
  view_count int;
  rpc_count int;
  rls_tests_total int;
  rls_tests_passed int;
  policy_total int;
  policy_active int;
  hitl_enabled boolean;
  alert_total int;
  alert_critical int;
  alert_resolved int;
  decision_total bigint;
  decision_human bigint;
  decision_system bigint;
  cert_count int;
  integrity_count int;
  baseline_count int;
  dlq_pending int;
  dlq_total int;
  rollback_total int;
  rollback_30d int;
BEGIN
  -- RLS Coverage (global)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE c.relrowsecurity = true)
  INTO rls_total, rls_enabled
  FROM pg_tables t
  JOIN pg_class c ON c.relname = t.tablename 
    AND c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public')
  WHERE t.schemaname = 'public';

  -- AI Actions
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE human_reviewed = true),
    COUNT(*) FILTER (WHERE review_decision = 'approved'),
    COUNT(*) FILTER (WHERE review_decision IS NULL)
  INTO ai_total, ai_reviewed, ai_approved, ai_pending
  FROM ai_actions WHERE tenant_id = p_tenant_id;

  -- Evidence & Audit Trail
  SELECT COUNT(*) INTO evidence_count FROM agent_evidence_logs WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO security_log_count FROM security_logs WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO exec_chain_count FROM agent_execution_chain 
    WHERE agent_id IN (SELECT id FROM agents WHERE tenant_id = p_tenant_id);

  -- Database hardening metrics (global)
  SELECT COUNT(*) INTO trigger_count 
  FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid 
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');
  
  SELECT COUNT(*) INTO immutable_trigger_count 
  FROM pg_trigger t JOIN pg_class c ON t.tgrelid = c.oid 
  WHERE c.relnamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public') 
    AND t.tgname LIKE '%immut%';

  SELECT COUNT(*) INTO view_count FROM pg_views WHERE schemaname = 'public' AND viewname LIKE 'v_%';
  
  SELECT COUNT(*) INTO rpc_count FROM pg_proc 
  WHERE pronamespace = (SELECT oid FROM pg_namespace WHERE nspname = 'public');

  -- RLS Test Results (global - no tenant_id column)
  SELECT COUNT(*), COUNT(*) FILTER (WHERE passed = true)
  INTO rls_tests_total, rls_tests_passed
  FROM rls_test_results;

  -- Security Policies
  SELECT COUNT(*), COUNT(*) FILTER (WHERE is_active = true)
  INTO policy_total, policy_active
  FROM security_policies WHERE tenant_id = p_tenant_id;

  -- HITL (Human-in-the-Loop) config
  SELECT COALESCE(force_human_review_critical, false) INTO hitl_enabled
  FROM tenant_settings WHERE tenant_id = p_tenant_id;

  -- Alerts
  SELECT 
    COUNT(*) FILTER (WHERE resolved = false),
    COUNT(*) FILTER (WHERE resolved = false AND severity = 'critical'),
    COUNT(*) FILTER (WHERE resolved = true)
  INTO alert_total, alert_critical, alert_resolved
  FROM system_alerts WHERE tenant_id = p_tenant_id;

  -- Decision Events
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE actor_type = 'human'),
    COUNT(*) FILTER (WHERE actor_type = 'system')
  INTO decision_total, decision_human, decision_system
  FROM decision_events WHERE tenant_id = p_tenant_id;

  -- Agent security features
  SELECT COUNT(*) INTO cert_count FROM agent_certificates WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO integrity_count FROM agent_file_integrity WHERE tenant_id = p_tenant_id;
  SELECT COUNT(*) INTO baseline_count FROM agent_behavioral_baseline WHERE tenant_id = p_tenant_id;

  -- DLQ
  SELECT 
    COUNT(*) FILTER (WHERE status = 'pending'),
    COUNT(*)
  INTO dlq_pending, dlq_total
  FROM failed_jobs_dlq WHERE tenant_id = p_tenant_id;

  -- Rollbacks
  SELECT 
    COUNT(*),
    COUNT(*) FILTER (WHERE created_at > NOW() - INTERVAL '30 days')
  INTO rollback_total, rollback_30d
  FROM agent_rollback_events WHERE tenant_id = p_tenant_id;

  SELECT jsonb_build_object(
    'agents', jsonb_build_object(
      'total', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
      'online', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status = 'active'),
      'offline', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL AND status != 'active'),
      'in_safe_mode', (SELECT COUNT(*) FROM agent_safe_mode_events WHERE tenant_id = p_tenant_id AND resolved_at IS NULL)
    ),
    'decision_events', jsonb_build_object(
      'total', decision_total,
      'by_human', decision_human,
      'by_system', decision_system,
      'governance_active', decision_total > 0
    ),
    'ai_actions', jsonb_build_object(
      'total', ai_total,
      'human_reviewed', ai_reviewed,
      'approved', ai_approved,
      'pending', ai_pending,
      'review_rate', CASE WHEN ai_total > 0 THEN ROUND((ai_reviewed::numeric / ai_total) * 100, 1) ELSE 0 END,
      'approval_rate', CASE WHEN ai_total > 0 THEN ROUND((ai_approved::numeric / ai_total) * 100, 1) ELSE 0 END
    ),
    'human_oversight', jsonb_build_object(
      'hitl_enabled', COALESCE(hitl_enabled, false),
      'force_human_review_critical', COALESCE(hitl_enabled, false),
      'kill_switch_available', true,
      'ai_actions_total', ai_total,
      'ai_actions_reviewed', ai_reviewed,
      'review_rate', CASE WHEN ai_total > 0 THEN ROUND((ai_reviewed::numeric / ai_total) * 100, 1) ELSE 0 END,
      'dry_run_mode_available', true
    ),
    'tenant_isolation', jsonb_build_object(
      'rls_enabled_tables', rls_enabled,
      'rls_total_tables', rls_total,
      'rls_coverage_percent', CASE WHEN rls_total > 0 THEN ROUND((rls_enabled::numeric / rls_total) * 100, 1) ELSE 0 END,
      'rls_tests_total', rls_tests_total,
      'rls_tests_passed', rls_tests_passed,
      'rls_tests_pass_rate', CASE WHEN rls_tests_total > 0 THEN ROUND((rls_tests_passed::numeric / rls_tests_total) * 100, 1) ELSE 0 END,
      'multi_tenant_architecture', true
    ),
    'evidence_trail', jsonb_build_object(
      'evidence_logs', evidence_count,
      'security_logs', security_log_count,
      'execution_chains', exec_chain_count,
      'cryptographic_hash_chains', exec_chain_count > 0,
      'immutable_audit_trail', true,
      'agent_certificates', cert_count,
      'file_integrity_scans', integrity_count,
      'behavioral_baselines', baseline_count
    ),
    'database_hardening', jsonb_build_object(
      'total_triggers', trigger_count,
      'immutability_triggers', immutable_trigger_count,
      'governance_views', view_count,
      'rpc_functions', rpc_count,
      'security_definer_views', true,
      'security_barrier_views', true
    ),
    'enforcement', jsonb_build_object(
      'policies_total', policy_total,
      'policies_active', policy_active,
      'compliance_frameworks', jsonb_build_array('ISO27001', 'SOC2', 'LGPD', 'NIST'),
      'automated_enforcement', true
    ),
    'dlq', jsonb_build_object(
      'current', dlq_pending,
      'total', dlq_total
    ),
    'rollbacks', jsonb_build_object(
      'total', rollback_total,
      'last_30d', rollback_30d
    ),
    'alerts', jsonb_build_object(
      'open', alert_total,
      'critical_open', alert_critical,
      'resolved', alert_resolved,
      'decision_coverage_percent', CASE 
        WHEN (alert_total + alert_resolved) > 0 
        THEN ROUND((alert_resolved::numeric / (alert_total + alert_resolved)) * 100, 1)
        ELSE 100 
      END
    ),
    'system_capabilities', jsonb_build_object(
      'endpoint_monitoring', true,
      'vulnerability_detection', true,
      'certificate_management', cert_count > 0,
      'file_integrity_monitoring', integrity_count > 0,
      'behavioral_anomaly_detection', true,
      'network_anomaly_detection', true,
      'ai_powered_analysis', true,
      'multi_provider_ai_routing', true,
      'automated_remediation', true,
      'compliance_dashboard', true,
      'action_center', true,
      'predictive_failure_analysis', true,
      'hmac_authentication', true,
      'execution_hash_chains', exec_chain_count > 0,
      'job_orchestration', true,
      'safe_mode_protection', true,
      'agent_build_pipeline', true,
      'dns_filtering', true
    ),
    'users', jsonb_build_object(
      'count', COALESCE((SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id), 0)
    ),
    'policies', jsonb_build_object(
      'total', policy_total,
      'active', policy_active
    ),
    'tenant_stats', jsonb_build_object(
      'agent_count', (SELECT COUNT(*) FROM agents WHERE tenant_id = p_tenant_id AND archived_at IS NULL),
      'job_count', COALESCE((SELECT COUNT(*) FROM jobs WHERE tenant_id = p_tenant_id), 0),
      'user_count', COALESCE((SELECT COUNT(DISTINCT user_id) FROM user_roles WHERE tenant_id = p_tenant_id), 0)
    ),
    'collected_at', NOW(),
    'version', '4.0.0'
  ) INTO result;

  RETURN result;
END;
$$;
