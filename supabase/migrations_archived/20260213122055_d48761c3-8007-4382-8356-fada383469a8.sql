
-- =====================================================
-- EMERGENCY FIX: Restore incorrectly archived agents
-- Root cause: run_system_maintenance auto-archives agents
-- with last_heartbeat < 2 hours, killing overnight agents
-- =====================================================

-- 1. RESTORE the 7 Genial Cred agents archived at 2026-02-13 01:30:01
UPDATE agents
SET status = 'active', archived_at = NULL
WHERE archived_at = '2026-02-13 01:30:01.56988+00'
  AND tenant_id = '2584d2cd-8b99-4ca7-a8e2-b61256e82b3e';

-- 2. RESTORE pcteste1 from GameHouse archived at 2026-02-13 04:30:00
UPDATE agents
SET status = 'active', archived_at = NULL
WHERE id = 'd7c0e8c8-cd1d-4801-8516-c229f98ec4d5'
  AND archived_at = '2026-02-13 04:30:00.520948+00';

-- 3. REACTIVATE tokens for all restored agents
UPDATE agent_tokens
SET is_active = true
WHERE agent_id IN (
  '6d4638d7-cc01-4297-bbc7-748396022a3e', -- Pc-Davi-Tibery
  'b1c7c475-d193-40fa-90b5-194000f4bfab', -- Pc-Anna-Tibery
  '3a9e3f00-1ce3-4dbd-9381-56abc3810f63', -- Pc-Adm-Tibery
  'd0c28e52-f3f7-408c-8828-419cabf67b17', -- Pc-Meio-Planalto
  '86efd329-a0d7-477e-a1b9-280ee6804760', -- Pc-Thais-Tocantins
  'f24464f0-672b-4563-b684-77156783e12d', -- Pc-Vidro-Planalto
  '2ce7686c-afe1-431c-928d-7036d5b954aa', -- Pc-Yasmin-Tocantins
  'd7c0e8c8-cd1d-4801-8516-c229f98ec4d5'  -- pcteste1
);

-- 4. FIX run_system_maintenance: REMOVE auto-archive of agents
-- Agents should NEVER be auto-archived just because they're offline.
-- Offline != dead. Machines turn off at night and come back in the morning.
CREATE OR REPLACE FUNCTION run_system_maintenance()
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb := '{}'::jsonb;
  v_stale_tasks jsonb;
  v_cancelled_jobs integer;
  v_dlq_reconciled integer := 0;
  v_stale_jobs_moved integer := 0;
BEGIN
  -- 1. Auto-resolve stale tasks
  v_stale_tasks := auto_resolve_stale_tasks();
  v_result := v_result || jsonb_build_object('stale_tasks', v_stale_tasks);

  -- 2. Cancel jobs for ALREADY archived agents (don't archive new ones!)
  v_cancelled_jobs := auto_cancel_archived_agent_jobs();
  v_result := v_result || jsonb_build_object('archived_agent_jobs_cancelled', v_cancelled_jobs);

  -- 3. REMOVED: Auto-archive agents. This was destroying the fleet every night.
  -- Agents should only be archived manually or via explicit admin action.
  -- Offline agents are NOT dead agents. They just turned off for the night.
  v_result := v_result || jsonb_build_object('agents_archived', 0, 'auto_archive_disabled', true);

  -- 4. Reconcile DLQ entries for archived agents
  WITH reconciled AS (
    UPDATE failed_jobs_dlq dlq
    SET status = 'ignored', resolved_at = now(), resolved_by = 'system_maintenance'
    FROM jobs j
    WHERE dlq.original_job_id = j.id AND j.status = 'archived' AND dlq.status = 'pending'
    RETURNING dlq.id
  )
  SELECT count(*) INTO v_dlq_reconciled FROM reconciled;
  v_result := v_result || jsonb_build_object('dlq_reconciled', v_dlq_reconciled);

  -- 5. Move stale queued jobs (>2h) to failed + DLQ
  WITH moved AS (
    UPDATE jobs
    SET status = 'failed', finished_at = now(), error_message = '[DLQ:AGENT_OFFLINE] Job queued > 2h'
    WHERE status = 'queued' AND created_at < now() - interval '2 hours'
    RETURNING id, tenant_id, agent_id, agent_name, type, payload
  )
  INSERT INTO failed_jobs_dlq (original_job_id, tenant_id, agent_id, agent_name, job_type, payload, error_message, status, first_failure_at, last_failure_at, failure_class, created_at)
  SELECT id, tenant_id, agent_id, agent_name, type, payload, '[DLQ:AGENT_OFFLINE]', 'pending', now(), now(), 'stale_queue', now()
  FROM moved ON CONFLICT DO NOTHING;
  GET DIAGNOSTICS v_stale_jobs_moved = ROW_COUNT;
  v_result := v_result || jsonb_build_object('stale_jobs_moved_to_dlq', v_stale_jobs_moved);

  -- 6. SLA breach detection
  UPDATE tasks SET sla_breached_at = now()
  WHERE status IN ('open','in_progress') AND due_at IS NOT NULL AND due_at < now() AND sla_breached_at IS NULL;

  v_result := v_result || jsonb_build_object('executed_at', now());
  RETURN v_result;
END;
$$;
