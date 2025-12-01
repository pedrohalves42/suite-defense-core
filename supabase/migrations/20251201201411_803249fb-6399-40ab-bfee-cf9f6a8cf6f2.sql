-- Create security collection jobs for testepc2 agent
-- This will populate security data tables for complete system validation

WITH agent_info AS (
  SELECT id, tenant_id, agent_name 
  FROM agents 
  WHERE agent_name = 'testepc2'
  LIMIT 1
)
INSERT INTO jobs (tenant_id, agent_id, agent_name, type, status, payload, approved)
SELECT 
  tenant_id, 
  id, 
  agent_name,
  job_type,
  'queued',
  '{}'::jsonb,
  true
FROM agent_info
CROSS JOIN (
  VALUES 
    ('software_inventory_collect'),
    ('collect_antivirus_status'),
    ('collect_web_activity'),
    ('light_vuln_scan')
) AS job_types(job_type)
WHERE EXISTS (SELECT 1 FROM agent_info);

-- Verify jobs were created
SELECT 
  j.id,
  j.agent_name,
  j.type,
  j.status,
  j.created_at
FROM jobs j
WHERE j.agent_name = 'testepc2'
  AND j.type IN ('software_inventory_collect', 'collect_antivirus_status', 'collect_web_activity', 'light_vuln_scan')
ORDER BY j.created_at DESC
LIMIT 10;