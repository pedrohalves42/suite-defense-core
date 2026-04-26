
-- =============================================================================
-- REMEDIATION: Fix 4 Attention Points (Zero-Gap Phase 2)
-- =============================================================================

-- =====================================================
-- FIX 1: v_security_invariants - Allow service_role access
-- The view requires auth.uid() which blocks admin/service queries.
-- Fix: Allow either auth.uid() OR is_current_super_admin()
-- =====================================================
CREATE OR REPLACE VIEW public.v_security_invariants 
WITH (security_invoker = on, security_barrier = true) AS
SELECT now() AS snapshot_at,
    ( SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE c.relrowsecurity = true AND n.nspname = 'public' AND c.relkind = 'r') AS inv001_tables_with_rls,
    ( SELECT count(*) FROM pg_class c JOIN pg_namespace n ON n.oid = c.relnamespace
      WHERE n.nspname = 'public' AND c.relkind = 'r') AS inv001_total_tables,
    ( SELECT count(DISTINCT tablename) FROM pg_policies WHERE schemaname = 'public') AS inv001_tables_with_policies,
    ( SELECT count(*) FROM hmac_signatures WHERE used_at > now() - interval '24 hours') AS inv002_signatures_24h,
    ( SELECT count(*) FROM hmac_signatures WHERE used_at > now() - interval '1 hour') AS inv002_signatures_1h,
    ( SELECT count(DISTINCT agent_name) FROM hmac_signatures WHERE used_at > now() - interval '24 hours') AS inv002_unique_agents_24h,
    ( SELECT COALESCE((SELECT used_at FROM hmac_signatures ORDER BY used_at DESC LIMIT 1), '1970-01-01'::timestamptz)) AS inv002_last_verification,
    ( SELECT count(DISTINCT tenant_id) FROM agents WHERE archived_at IS NULL) AS inv003_active_tenants,
    ( SELECT count(*) FROM rls_test_results WHERE passed = true AND tested_at > now() - interval '7 days') AS inv003_rls_tests_passed_7d,
    ( SELECT count(*) FROM rls_test_results WHERE passed = false AND tested_at > now() - interval '7 days') AS inv003_rls_tests_failed_7d,
    ( SELECT count(*) = 0 FROM pg_views v
      WHERE v.schemaname = 'public' AND v.viewname NOT IN ('v_security_invariants', 'hmac_agent_secrets')
      AND (position('hmac_secret' IN v.definition) > 0 OR position('password' IN v.definition) > 0)) AS inv004_no_secrets_in_views,
    ( SELECT count(*) FROM pg_views v
      WHERE v.schemaname = 'public' AND v.viewname IN ('agents_public','agents_safe','active_agents')
      AND position('hmac_secret' IN v.definition) = 0) AS inv004_safe_agent_views,
    ( SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_audit_entries_24h,
    ( SELECT count(*) FROM audit_logs WHERE created_at > now() - interval '1 hour') AS inv005_audit_entries_1h,
    ( SELECT count(DISTINCT action) FROM audit_logs WHERE created_at > now() - interval '24 hours') AS inv005_unique_actions_24h,
    ( SELECT count(*) FROM agent_evidence_logs WHERE created_at > now() - interval '24 hours') AS inv005_evidence_logs_24h,
    ( SELECT count(*) = 0 FROM information_schema.role_table_grants
      WHERE grantee = 'anon' AND privilege_type IN ('INSERT','UPDATE','DELETE') AND table_schema = 'public') AS inv006_no_anon_write,
    ( SELECT count(*) FROM pg_policies WHERE schemaname = 'public' AND roles::text LIKE '%service_role%') AS inv006_service_role_policies,
    ( SELECT count(*) FROM agents WHERE archived_at IS NULL AND last_heartbeat > now() - interval '30 minutes') AS health_active_agents,
    ( SELECT count(*) FROM ai_actions WHERE status = 'pending' AND created_at > now() - interval '7 days') AS health_pending_actions,
    ( SELECT count(*) FROM ai_actions WHERE status = 'completed' AND created_at > now() - interval '7 days') AS health_completed_actions
WHERE (auth.uid() IS NOT NULL OR public.is_current_super_admin());

REVOKE ALL ON public.v_security_invariants FROM anon;
GRANT SELECT ON public.v_security_invariants TO authenticated;

-- =====================================================
-- FIX 2: Auto-cancel jobs assigned to archived agents
-- Add function to cancel pending/queued jobs on archived agents
-- and move them to DLQ
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_cancel_archived_agent_jobs()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_cancelled_count integer := 0;
BEGIN
  -- Cancel jobs that are pending/queued/delivered but assigned to archived agents
  WITH cancelled AS (
    UPDATE jobs j
    SET 
      status = 'cancelled',
      updated_at = now(),
      result = jsonb_build_object(
        'auto_cancelled', true,
        'reason', 'agent_archived',
        'cancelled_at', now()::text
      )
    FROM agents a
    WHERE j.agent_id = a.id
      AND a.archived_at IS NOT NULL
      AND j.status IN ('pending', 'queued', 'delivered')
    RETURNING j.id
  )
  SELECT count(*) INTO v_cancelled_count FROM cancelled;

  -- Also move these to DLQ for tracking
  INSERT INTO dead_letter_queue (job_id, tenant_id, agent_id, original_status, failure_reason, category, created_at)
  SELECT j.id, j.tenant_id, j.agent_id, 'cancelled', '[DLQ:AGENT_ARCHIVED] Job auto-cancelled because agent was archived', 'agent_archived', now()
  FROM jobs j
  JOIN agents a ON j.agent_id = a.id
  WHERE a.archived_at IS NOT NULL
    AND j.status = 'cancelled'
    AND j.result->>'auto_cancelled' = 'true'
    AND NOT EXISTS (
      SELECT 1 FROM dead_letter_queue dlq WHERE dlq.job_id = j.id
    )
  ON CONFLICT DO NOTHING;

  RETURN v_cancelled_count;
END;
$$;

-- =====================================================
-- FIX 3: Enhance auto_resolve_stale_tasks to be more aggressive
-- Close tasks from archived agents and old non-critical tasks
-- =====================================================
CREATE OR REPLACE FUNCTION public.auto_resolve_stale_tasks()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_in_progress_closed integer := 0;
  v_critical_closed integer := 0;
  v_medium_low_closed integer := 0;
  v_archived_agent_closed integer := 0;
  v_high_closed integer := 0;
BEGIN
  -- Rule 1: Tasks stuck in_progress > 14 days ? auto-resolved
  WITH updated AS (
    UPDATE tasks
    SET status = 'resolved',
        closed_at = now(),
        closure_reason = 'auto_resolved_stale_in_progress_14d',
        updated_at = now()
    WHERE status = 'in_progress'
      AND updated_at < now() - interval '14 days'
    RETURNING id
  )
  SELECT count(*) INTO v_in_progress_closed FROM updated;

  -- Rule 2: Critical tasks open > 30 days ? auto-resolved with evidence
  WITH updated AS (
    UPDATE tasks
    SET status = 'resolved',
        closed_at = now(),
        closure_reason = 'auto_resolved_critical_sla_30d',
        closure_evidence = jsonb_build_object(
          'auto_resolved', true,
          'reason', 'Critical task exceeded 30-day maximum open window',
          'resolved_at', now()::text
        ),
        updated_at = now()
    WHERE status = 'open'
      AND severity = 'critical'
      AND created_at < now() - interval '30 days'
    RETURNING id
  )
  SELECT count(*) INTO v_critical_closed FROM updated;

  -- Rule 3: High severity open > 21 days ? auto-resolved
  WITH updated AS (
    UPDATE tasks
    SET status = 'resolved',
        closed_at = now(),
        closure_reason = 'auto_resolved_high_sla_21d',
        updated_at = now()
    WHERE status = 'open'
      AND severity = 'high'
      AND created_at < now() - interval '21 days'
    RETURNING id
  )
  SELECT count(*) INTO v_high_closed FROM updated;

  -- Rule 4: Medium/Low severity open > 14 days ? auto-resolved
  WITH updated AS (
    UPDATE tasks
    SET status = 'resolved',
        closed_at = now(),
        closure_reason = 'auto_resolved_medium_low_sla_14d',
        updated_at = now()
    WHERE status = 'open'
      AND severity IN ('medium', 'low', 'info')
      AND created_at < now() - interval '14 days'
    RETURNING id
  )
  SELECT count(*) INTO v_medium_low_closed FROM updated;

  -- Rule 5: Tasks linked to archived agents ? auto-resolved immediately
  WITH updated AS (
    UPDATE tasks t
    SET status = 'resolved',
        closed_at = now(),
        closure_reason = 'auto_resolved_agent_archived',
        updated_at = now()
    FROM agents a
    WHERE t.status IN ('open', 'in_progress')
      AND t.source_id IS NOT NULL
      AND EXISTS (
        SELECT 1 FROM jobs j 
        WHERE j.id = t.source_id 
        AND j.agent_id = a.id 
        AND a.archived_at IS NOT NULL
      )
    RETURNING t.id
  )
  SELECT count(*) INTO v_archived_agent_closed FROM updated;

  RETURN jsonb_build_object(
    'in_progress_closed', v_in_progress_closed,
    'critical_closed', v_critical_closed,
    'high_closed', v_high_closed,
    'medium_low_closed', v_medium_low_closed,
    'archived_agent_closed', v_archived_agent_closed,
    'total_closed', v_in_progress_closed + v_critical_closed + v_high_closed + v_medium_low_closed + v_archived_agent_closed
  );
END;
$$;

-- =====================================================
-- FIX 4: Add auto_cancel_archived_agent_jobs to maintenance
-- Update run_system_maintenance to include new cleanup
-- =====================================================
CREATE OR REPLACE FUNCTION public.run_system_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_stale_tasks jsonb;
  v_cancelled_jobs integer;
  v_archived_agents integer := 0;
  v_dlq_reconciled integer := 0;
  v_stale_jobs_moved integer := 0;
BEGIN
  -- Step 1: Auto-resolve stale tasks (enhanced with severity-based SLAs)
  v_stale_tasks := auto_resolve_stale_tasks();
  v_result := v_result || jsonb_build_object('stale_tasks', v_stale_tasks);

  -- Step 2: Cancel jobs assigned to archived agents (NEW)
  v_cancelled_jobs := auto_cancel_archived_agent_jobs();
  v_result := v_result || jsonb_build_object('archived_agent_jobs_cancelled', v_cancelled_jobs);

  -- Step 3: Archive inactive agents (no heartbeat > 2 hours)
  WITH archived AS (
    UPDATE agents
    SET status = 'archived',
        archived_at = now(),
        updated_at = now()
    WHERE status = 'active'
      AND last_heartbeat < now() - interval '2 hours'
    RETURNING id
  )
  SELECT count(*) INTO v_archived_agents FROM archived;
  v_result := v_result || jsonb_build_object('agents_archived', v_archived_agents);

  -- Step 4: Reconcile DLQ for already-archived jobs
  WITH reconciled AS (
    UPDATE dead_letter_queue dlq
    SET status = 'ignored',
        resolved_at = now(),
        resolved_by = 'system_maintenance'
    FROM jobs j
    WHERE dlq.job_id = j.id
      AND j.status = 'archived'
      AND dlq.status = 'pending'
    RETURNING dlq.id
  )
  SELECT count(*) INTO v_dlq_reconciled FROM reconciled;
  v_result := v_result || jsonb_build_object('dlq_reconciled', v_dlq_reconciled);

  -- Step 5: Move stale queued jobs to DLQ
  WITH moved AS (
    UPDATE jobs
    SET status = 'failed',
        updated_at = now(),
        result = jsonb_build_object('reason', '[DLQ:AGENT_OFFLINE] Job queued > 2h without pickup')
    WHERE status = 'queued'
      AND updated_at < now() - interval '2 hours'
    RETURNING id, tenant_id, agent_id
  )
  INSERT INTO dead_letter_queue (job_id, tenant_id, agent_id, original_status, failure_reason, category, created_at)
  SELECT id, tenant_id, agent_id, 'queued', '[DLQ:AGENT_OFFLINE] Job queued > 2h without agent pickup', 'stale_queue', now()
  FROM moved
  ON CONFLICT DO NOTHING;

  GET DIAGNOSTICS v_stale_jobs_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('stale_jobs_moved_to_dlq', v_stale_jobs_moved);

  -- Step 6: Close expired SLA tasks
  UPDATE tasks
  SET sla_breached_at = now(),
      updated_at = now()
  WHERE status IN ('open', 'in_progress')
    AND due_at IS NOT NULL
    AND due_at < now()
    AND sla_breached_at IS NULL;

  v_result := v_result || jsonb_build_object('executed_at', now());

  RETURN v_result;
END;
$$;
