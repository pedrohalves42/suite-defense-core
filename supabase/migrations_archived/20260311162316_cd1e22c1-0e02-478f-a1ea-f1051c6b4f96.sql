-- Fix: Allow collect_web_activity to complete even without data
-- The agent may have no browser history/DNS cache on some endpoints
CREATE OR REPLACE FUNCTION enforce_job_side_effects()
RETURNS trigger AS $$
BEGIN
  IF OLD.status IS DISTINCT FROM 'completed'
     AND NEW.status = 'completed' THEN

    -- collect_web_activity: RELAXED - empty web activity is valid
    -- (endpoint may have no browser/DNS data)

    -- collect_system_metrics must have metrics data
    IF NEW.type = 'collect_system_metrics' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM agent_system_metrics asm
        WHERE asm.agent_id = NEW.agent_id
          AND asm.created_at >= NEW.created_at
      ) THEN
        RAISE EXCEPTION
          'JOB_INTEGRITY_VIOLATION: collect_system_metrics completed without metrics data (job_id=%, agent_id=%)',
          NEW.id, NEW.agent_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

-- Cancel stuck delivered web_activity jobs so new ones can be seeded
UPDATE jobs SET status = 'cancelled', error_message = 'Cancelled: trigger fix applied'
WHERE type = 'collect_web_activity' AND status IN ('delivered', 'pending');