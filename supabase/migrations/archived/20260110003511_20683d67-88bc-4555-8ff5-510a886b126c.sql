
-- 1.3 Backfill tasks with fingerprint_id (corrected type casts)

-- Step 1: Via source_id matching failure_occurrences.source_id (both cast to text)
UPDATE tasks t
SET fingerprint_id = (
  SELECT DISTINCT fo.fingerprint_id 
  FROM failure_occurrences fo
  WHERE fo.source_id IS NOT NULL
    AND fo.source_id::text = t.source_id::text
    AND fo.fingerprint_id IS NOT NULL
  LIMIT 1
)
WHERE t.fingerprint_id IS NULL
  AND t.source_id IS NOT NULL
  AND t.source_type IN ('job', 'agent', 'incident_group');

-- Step 2: Via agent_id for agent source types
UPDATE tasks t
SET fingerprint_id = (
  SELECT fo.fingerprint_id 
  FROM failure_occurrences fo
  WHERE fo.agent_id IS NOT NULL
    AND fo.agent_id::text = t.source_id::text
    AND fo.fingerprint_id IS NOT NULL
  ORDER BY fo.occurred_at DESC
  LIMIT 1
)
WHERE t.source_type = 'agent'
  AND t.fingerprint_id IS NULL
  AND t.source_id IS NOT NULL;

-- Run initial SLO refresh
SELECT refresh_all_incident_slos();
