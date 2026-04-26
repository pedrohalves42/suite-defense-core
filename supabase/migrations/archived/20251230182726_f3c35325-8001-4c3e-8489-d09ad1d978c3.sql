-- Fix security_invoker on job_integrity_violations view
DROP VIEW IF EXISTS job_integrity_violations;

CREATE VIEW job_integrity_violations WITH (security_invoker = true) AS
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