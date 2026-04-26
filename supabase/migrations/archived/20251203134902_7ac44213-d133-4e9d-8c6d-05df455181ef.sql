
-- Drop existing check constraint and recreate with all valid event types
ALTER TABLE installation_analytics DROP CONSTRAINT IF EXISTS installation_analytics_event_type_check;

ALTER TABLE installation_analytics ADD CONSTRAINT installation_analytics_event_type_check 
CHECK (event_type IN ('generated', 'command_copied', 'downloaded', 'installed', 'post_installation', 'post_installation_unverified', 'installation_failed'));

-- Now insert test telemetry data for testepc2
INSERT INTO installation_analytics (tenant_id, agent_id, agent_name, event_type, platform, installation_method, success, metadata)
SELECT 
  a.tenant_id,
  a.id,
  a.agent_name,
  'downloaded',
  COALESCE(a.os_type, 'windows'),
  'one_click',
  true,
  '{"source": "manual_test_data"}'::jsonb
FROM agents a
WHERE a.agent_name = 'testepc2';

INSERT INTO installation_analytics (tenant_id, agent_id, agent_name, event_type, platform, installation_method, success, installation_time_seconds, metadata)
SELECT 
  a.tenant_id,
  a.id,
  a.agent_name,
  'post_installation',
  COALESCE(a.os_type, 'windows'),
  'one_click',
  true,
  45,
  '{"source": "manual_test_data", "verified": true}'::jsonb
FROM agents a
WHERE a.agent_name = 'testepc2';
