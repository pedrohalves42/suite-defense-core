\set ON_ERROR_STOP on
\set QUIET on
\pset pager off

-- Config
\set user_a '''3e84844f-4be2-4a7a-b2e0-811d5975874f'''
\set tenant_a '''2584d2cd-8b99-4ca7-a8e2-b61256e82b3e'''
\set user_b '''eebda51c-169e-45e3-9ed3-99707229a2cf'''
\set tenant_b '''3adc67e6-8908-4d98-b85b-5e93be4673a1'''

DROP TABLE IF EXISTS xtenant_results; CREATE TEMP TABLE xtenant_results(
  table_name text,
  scenario text,
  leaked_rows bigint,
  err text
);

DO $$
DECLARE
  t text;
  n bigint;
  tables text[] := ARRAY[
    'agents','tasks','system_alerts','jobs','ai_insights',
    'agent_web_activity','agent_disk_metrics','agent_network_info','agent_builds',
    'agent_evidence_logs','agent_rollback_events','agent_safe_mode_events',
    'enrollment_keys','security_policies','governance_reports','playbook_executions',
    'scheduled_jobs','vuln_findings','software_inventory','user_roles',
    'tenant_features','tenant_action_policies','blocked_websites',
    'ai_action_logs','api_keys','api_request_logs','compliance_policies',
    'failed_login_attempts','quarantined_files','report_executions','reports',
    'security_logs','soc2_controls','soc2_criteria','tenant_settings',
    'tenant_subscriptions','vendor_risk_registry','virus_scans',
    'anomaly_events','audit_reason_trees','ai_action_validations',
    'antivirus_status','custom_trials','policy_assignments'
  ];
  scenarios text[][] := ARRAY[
    ['A_sees_B','3e84844f-4be2-4a7a-b2e0-811d5975874f','2584d2cd-8b99-4ca7-a8e2-b61256e82b3e','3adc67e6-8908-4d98-b85b-5e93be4673a1'],
    ['B_sees_A','eebda51c-169e-45e3-9ed3-99707229a2cf','3adc67e6-8908-4d98-b85b-5e93be4673a1','2584d2cd-8b99-4ca7-a8e2-b61256e82b3e']
  ];
  s text[];
  claims text;
  q text;
BEGIN
  FOREACH s SLICE 1 IN ARRAY scenarios LOOP
    claims := json_build_object(
      'sub', s[2],
      'role','authenticated',
      'app_metadata', json_build_object('active_tenant_id', s[3])
    )::text;

    FOREACH t IN ARRAY tables LOOP
      BEGIN
        PERFORM set_config('role','authenticated',true);
        PERFORM set_config('request.jwt.claims', claims, true);
        PERFORM set_config('request.jwt.claim.sub', s[2], true);
        q := format('SELECT count(*) FROM public.%I WHERE tenant_id = %L', t, s[4]);
        EXECUTE q INTO n;
        INSERT INTO xtenant_results VALUES (t, s[1], n, NULL);
      EXCEPTION WHEN OTHERS THEN
        INSERT INTO xtenant_results VALUES (t, s[1], NULL, SQLERRM);
      END;
    END LOOP;
  END LOOP;
END$$;

\pset format aligned
SELECT scenario,
       count(*) FILTER (WHERE leaked_rows = 0) AS ok_zero,
       count(*) FILTER (WHERE leaked_rows > 0) AS leaked,
       count(*) FILTER (WHERE err IS NOT NULL) AS errored
FROM xtenant_results GROUP BY scenario ORDER BY scenario;

\echo '--- LEAKS (rows > 0) ---'
SELECT * FROM xtenant_results WHERE leaked_rows > 0 ORDER BY scenario, table_name;

\echo '--- ERRORS ---'
SELECT scenario, table_name, err FROM xtenant_results WHERE err IS NOT NULL ORDER BY scenario, table_name;

\echo '--- FULL RESULTS (json) ---'
SELECT json_agg(row_to_json(r) ORDER BY scenario, table_name) FROM xtenant_results r \gset
\echo :json_agg
