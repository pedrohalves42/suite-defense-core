-- =============================================================================
-- ADR-031 Addendum: Add 'job' and 'dlq' to tasks.source_type constraint
-- and backfill tasks for failed jobs without task (last 7 days)
-- =============================================================================

-- Step 1: Drop old constraint
ALTER TABLE tasks DROP CONSTRAINT IF EXISTS tasks_source_type_check;

-- Step 2: Add updated constraint with 'job' and 'dlq'
ALTER TABLE tasks ADD CONSTRAINT tasks_source_type_check 
CHECK (source_type = ANY (ARRAY['ai_insight', 'system_alert', 'playbook_execution', 'red_team', 'manual', 'job', 'dlq']));

-- Step 3: Backfill tasks for failed jobs (last 7 days)
INSERT INTO tasks (
  tenant_id,
  source_type,
  source_id,
  title,
  description,
  severity,
  status,
  requires_human_review,
  auto_generated,
  due_at
)
SELECT
  j.tenant_id,
  'job',
  j.id,
  '[Retroativo] ' || j.type || ': ' || COALESCE(j.failure_class, 'UNKNOWN'),
  COALESCE(j.error_message, 'Job falhou sem mensagem de erro detalhada'),
  CASE j.failure_class
    WHEN 'BUG' THEN 'critical'
    WHEN 'CASCADE_FAILURE' THEN 'critical'
    WHEN 'AGENT_STALLED' THEN 'high'
    WHEN 'AGENT_OFFLINE' THEN 'medium'
    ELSE 'low'
  END,
  'open',
  j.failure_class IN ('BUG', 'CASCADE_FAILURE'),
  true,
  NOW() + INTERVAL '72 hours'
FROM jobs j
WHERE j.status = 'failed'
  AND j.completed_at > NOW() - INTERVAL '7 days'
  AND COALESCE(j.failure_class, '') NOT IN ('EXPECTED_DROP', 'TRANSIENT')
  AND NOT EXISTS (
    SELECT 1 FROM tasks t
    WHERE t.source_type = 'job'
      AND t.source_id = j.id
  );