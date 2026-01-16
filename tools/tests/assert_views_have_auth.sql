-- CI Validation: Verify all public views have auth.uid() or is_current_super_admin() check
-- This test ensures security-sensitive views cannot be accessed without authentication
-- Updated: ADR-024 Phase 2 (2026-01-13)

DO $$
DECLARE
  unsafe_views text[];
BEGIN
  SELECT array_agg(viewname) INTO unsafe_views
  FROM pg_views
  WHERE schemaname = 'public'
  AND viewname IN (
    'active_agents',
    'agents_safe', 
    'agents_public', 
    'agents_health_view', 
    'invites_safe', 
    'governance_health_metrics',
    'job_integrity_violations',
    'profiles_public',
    'v_incident_groups',
    'v_job_health_anomalies'
  )
  AND definition NOT LIKE '%auth.uid()%'
  AND definition NOT LIKE '%is_current_super_admin()%';
  
  IF array_length(unsafe_views, 1) > 0 THEN
    RAISE EXCEPTION 'SECURITY VIOLATION: Views without authentication check: %', unsafe_views;
  END IF;
  
  RAISE NOTICE 'PASS: All security-sensitive views have authentication checks';
END $$;
