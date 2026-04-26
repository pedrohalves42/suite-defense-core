-- Force create collect_web_activity jobs for ALL online agents across all tenants
INSERT INTO jobs (agent_id, tenant_id, type, status, priority, payload, expires_at)
SELECT a.id, a.tenant_id, 'collect_web_activity', 'pending', 7, '{"source":"manual-force","urgent":true}'::jsonb, now() + interval '4 hours'
FROM agents a
WHERE a.status = 'active' AND a.last_heartbeat > now() - interval '2 hours'
AND NOT EXISTS (
  SELECT 1 FROM jobs j WHERE j.agent_id = a.id AND j.type = 'collect_web_activity' AND j.status IN ('pending','queued','delivered')
)