
-- =============================================================================
-- FIX-001: Add 'incident_group' to tasks source_type_check constraint
-- The check_incident_slo_task function inserts 'incident_group' but it's not 
-- in the allowed values, causing cron errors every 10 minutes
-- =============================================================================

ALTER TABLE public.tasks DROP CONSTRAINT IF EXISTS tasks_source_type_check;

ALTER TABLE public.tasks ADD CONSTRAINT tasks_source_type_check 
CHECK (source_type = ANY(ARRAY[
  'ai_insight', 'system_alert', 'playbook_execution', 'red_team', 
  'manual', 'job', 'dlq', 'incident_group'
]));
