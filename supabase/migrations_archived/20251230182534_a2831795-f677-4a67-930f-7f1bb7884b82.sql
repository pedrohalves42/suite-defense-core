-- Fix Zero Trust validation for collect_web_activity jobs
-- The trigger was checking only created_at, but deduplication updates visited_at instead
-- This caused jobs to fail validation when updating existing web activity records

-- Fix the enforce_job_side_effects function
CREATE OR REPLACE FUNCTION enforce_job_side_effects()
RETURNS trigger AS $$
BEGIN
  -- Only validate when transitioning TO completed status
  IF OLD.status IS DISTINCT FROM 'completed'
     AND NEW.status = 'completed' THEN

    -- VALIDATION: collect_web_activity must have web_activity data
    IF NEW.type = 'collect_web_activity' THEN
      IF NOT EXISTS (
        SELECT 1
        FROM agent_web_activity aw
        WHERE aw.agent_id = NEW.agent_id
          AND (aw.created_at >= NEW.created_at OR aw.visited_at >= NEW.created_at)
      ) THEN
        RAISE EXCEPTION
          'JOB_INTEGRITY_VIOLATION: collect_web_activity completed without web_activity data (job_id=%, agent_id=%)',
          NEW.id, NEW.agent_id
          USING ERRCODE = '23514';
      END IF;
    END IF;

    -- VALIDATION: collect_system_metrics must have metrics data
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
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Add index for performance on visited_at lookups
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_visited 
ON agent_web_activity(agent_id, visited_at DESC);

-- Update the job_integrity_violations view with same logic
DROP VIEW IF EXISTS job_integrity_violations;

CREATE VIEW job_integrity_violations AS
SELECT 
  j.id as job_id,
  j.agent_id,
  j.type as job_type,
  j.status,
  j.created_at as job_created_at,
  j.completed_at,
  CASE 
    WHEN j.type = 'collect_web_activity' AND NOT EXISTS (
      SELECT 1 FROM agent_web_activity aw 
      WHERE aw.agent_id = j.agent_id 
        AND (aw.created_at >= j.created_at OR aw.visited_at >= j.created_at)
    ) THEN 'missing_web_activity'
    WHEN j.type = 'collect_system_metrics' AND NOT EXISTS (
      SELECT 1 FROM agent_system_metrics asm 
      WHERE asm.agent_id = j.agent_id 
        AND asm.created_at >= j.created_at
    ) THEN 'missing_metrics'
    ELSE NULL
  END as violation_type
FROM jobs j
WHERE j.status = 'completed'
  AND j.created_at > now() - interval '7 days';

GRANT SELECT ON job_integrity_violations TO authenticated;