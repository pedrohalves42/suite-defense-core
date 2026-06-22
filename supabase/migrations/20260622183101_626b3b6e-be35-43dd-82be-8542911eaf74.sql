-- =====================================================================
-- S-P0.5: Defense-in-depth DB trigger for critical job completion
-- =====================================================================
-- Blocks UPDATE jobs SET status='completed' on critical types unless
-- at least one of the following evidences is present:
--   (a) NEW.output->>'evidence_hash' is 64-char hex
--   (b) agent_evidence_logs row exists for this job with valid hash
--   (c) Side-effect rows exist in the expected destination table since
--       job creation (or, for web_activity, an explicit empty warning)
-- Rollback:
--   DROP TRIGGER IF EXISTS trg_enforce_critical_job_evidence ON public.jobs;
--   DROP FUNCTION IF EXISTS public.enforce_critical_job_evidence();
-- =====================================================================

CREATE OR REPLACE FUNCTION public.enforce_critical_job_evidence()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_hash text;
  v_has_evidence_log boolean := false;
  v_has_side_effect boolean := false;
BEGIN
  -- Only act on the 'pending/queued/delivered/running -> completed' edge
  IF NEW.status IS DISTINCT FROM 'completed' THEN
    RETURN NEW;
  END IF;
  IF OLD.status = 'completed' THEN
    RETURN NEW;
  END IF;

  -- (a) Evidence hash in jobs.output (64-hex)
  v_hash := COALESCE(NEW.output->>'evidence_hash', '');
  IF v_hash ~ '^[0-9a-f]{64}$' THEN
    RETURN NEW;
  END IF;

  -- (b) Matching evidence log row
  SELECT EXISTS (
    SELECT 1
    FROM public.agent_evidence_logs ael
    WHERE ael.tenant_id = NEW.tenant_id
      AND ael.agent_id  = NEW.agent_id
      AND ael.event_data ->> 'job_id' = NEW.id::text
      AND ael.evidence_hash ~ '^[0-9a-f]{64}$'
  ) INTO v_has_evidence_log;
  IF v_has_evidence_log THEN
    RETURN NEW;
  END IF;

  -- (c) Side-effect rows by type
  IF NEW.type = 'software_inventory' THEN
    SELECT EXISTS (
      SELECT 1 FROM public.software_inventory si
      WHERE si.agent_id = NEW.agent_id
        AND si.last_seen_at >= NEW.created_at
    ) INTO v_has_side_effect;

  ELSIF NEW.type IN ('web_activity', 'collect_web_activity') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.agent_web_activity awa
      WHERE awa.agent_id = NEW.agent_id
        AND awa.created_at >= NEW.created_at
    ) OR COALESCE(NEW.error_message, '') ILIKE '%WARNING%'
    INTO v_has_side_effect;

  ELSIF NEW.type IN ('scan_vulnerabilities', 'security_scan') THEN
    SELECT EXISTS (
      SELECT 1 FROM public.agent_vulnerability_scans avs
      WHERE avs.agent_id = NEW.agent_id
        AND avs.created_at >= NEW.created_at
    ) INTO v_has_side_effect;

  ELSE
    -- Unknown critical type: be conservative, accept (no extra enforcement
    -- beyond the existing enforce_job_side_effects trigger).
    RETURN NEW;
  END IF;

  IF v_has_side_effect THEN
    RETURN NEW;
  END IF;

  RAISE EXCEPTION
    'JOB_INTEGRITY_VIOLATION: critical job % type=% completed without evidence_hash, evidence log, or side-effect rows',
    NEW.id, NEW.type
    USING ERRCODE = '23514';
END;
$$;

DROP TRIGGER IF EXISTS trg_enforce_critical_job_evidence ON public.jobs;

CREATE TRIGGER trg_enforce_critical_job_evidence
BEFORE UPDATE OF status ON public.jobs
FOR EACH ROW
WHEN (
  NEW.type IN (
    'security_scan',
    'software_inventory',
    'web_activity',
    'collect_web_activity',
    'scan_vulnerabilities'
  )
)
EXECUTE FUNCTION public.enforce_critical_job_evidence();

COMMENT ON FUNCTION public.enforce_critical_job_evidence() IS
  'S-P0.5 defense-in-depth: blocks critical job completion without evidence_hash, evidence log, or side-effect rows. See docs/audits/sp05-ack-job-trigger.md.';

-- =====================================================================
-- P-P0: Index for slow query #3 (jobs by status + retry_count, ordered by completed_at)
-- =====================================================================
-- Backs the recurring PostgREST query:
--   WHERE status = $1 AND retry_count < $2 ORDER BY completed_at ASC
-- Rollback: DROP INDEX IF EXISTS public.idx_jobs_status_retry_completed;
-- =====================================================================

CREATE INDEX IF NOT EXISTS idx_jobs_status_retry_completed
  ON public.jobs (status, retry_count, completed_at)
  WHERE retry_count IS NOT NULL;
