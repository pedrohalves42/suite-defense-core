-- =============================================================================
-- CI Guard: Validate RLS Hardening (ADR-023 + ADR-026)
-- =============================================================================
-- This test ensures no dangerous public policies exist after hardening.
-- Run this during migrations or CI to prevent security regressions.
-- =============================================================================

DO $$
DECLARE
  dangerous_count integer;
  missing_views integer;
  tables_without_rls text[];
BEGIN
  -- Check for dangerous public policies with USING(true) or WITH CHECK(true)
  SELECT COUNT(*) INTO dangerous_count
  FROM pg_policies
  WHERE schemaname = 'public'
    AND roles::text LIKE '%public%'
    AND (
      (cmd IN ('UPDATE', 'DELETE', 'ALL') AND (qual::text = 'true' OR qual IS NULL))
      OR
      (cmd = 'INSERT' AND (with_check::text = 'true' OR with_check IS NULL))
    );

  IF dangerous_count > 0 THEN
    RAISE EXCEPTION 
      'SECURITY VALIDATION FAILED: Found % dangerous public policies with permissive conditions. See ADR-023.',
      dangerous_count;
  END IF;

  -- Check for required secure views
  SELECT COUNT(*) INTO missing_views
  FROM (VALUES ('agents_public'), ('invites_safe'), ('agents_safe'), ('enrollment_keys_safe')) AS required(view_name)
  WHERE NOT EXISTS (
    SELECT 1 FROM information_schema.views 
    WHERE table_schema = 'public' AND table_name = required.view_name
  );

  IF missing_views > 0 THEN
    RAISE EXCEPTION 
      'SECURITY VALIDATION FAILED: Missing % required secure view(s). See ADR-023.',
      missing_views;
  END IF;
  
  -- ADR-026: Check critical multi-tenant tables have RLS enabled
  SELECT array_agg(tablename) INTO tables_without_rls
  FROM pg_tables t
  WHERE t.schemaname = 'public'
    AND t.tablename IN (
      'agents', 'jobs', 'invites', 'profiles', 'vuln_findings',
      'agent_tokens', 'enrollment_keys', 'api_keys'
    )
    AND NOT EXISTS (
      SELECT 1 FROM pg_class c
      JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relname = t.tablename
        AND n.nspname = 'public'
        AND c.relrowsecurity = true
    );

  IF array_length(tables_without_rls, 1) > 0 THEN
    RAISE EXCEPTION 
      'SECURITY VALIDATION FAILED: Critical tables without RLS: %. See ADR-026.',
      tables_without_rls;
  END IF;

  -- ADR-026: Check ALL partitions of telemetry tables have RLS enabled
  SELECT array_agg(pt.relname::text) INTO tables_without_rls
  FROM pg_inherits i
  JOIN pg_class pt ON pt.oid = i.inhrelid
  JOIN pg_class parent ON parent.oid = i.inhparent
  WHERE pt.relnamespace = 'public'::regnamespace
    AND pt.relkind = 'r'
    AND pt.relrowsecurity = false
    AND parent.relname IN (
      'endpoint_event_buffer_partitioned',
      'endpoint_network_events_partitioned',
      'endpoint_process_events_partitioned',
      'agent_system_metrics_partitioned',
      'audit_logs',
      'hmac_signatures',
      'job_executions'
    );

  IF array_length(tables_without_rls, 1) > 0 THEN
    RAISE EXCEPTION 
      'SECURITY VALIDATION FAILED: Partitions without RLS: %. Run SELECT ensure_partition_rls(); to fix. See ADR-026.',
      tables_without_rls;
  END IF;
  
  RAISE NOTICE 'SECURITY VALIDATION PASSED: RLS hardening verified (ADR-023 + ADR-026) including all partitions';
END $$;
