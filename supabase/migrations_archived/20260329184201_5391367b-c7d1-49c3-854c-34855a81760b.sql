-- PR-5: Create view for legacy agent telemetry
CREATE OR REPLACE VIEW public.v_legacy_agents_telemetry
WITH (security_invoker = on) AS
SELECT
  a.tenant_id,
  a.id AS agent_id,
  a.agent_name,
  a.agent_version,
  a.status,
  a.last_heartbeat,
  a.enrolled_at,
  CASE
    WHEN a.hmac_secret IS NULL OR a.hmac_secret = '' THEN false
    ELSE true
  END AS has_hmac,
  CASE
    WHEN a.agent_version IS NULL THEN 'unknown'
    WHEN a.agent_version < '5.0.12' THEN 'legacy'
    ELSE 'modern'
  END AS version_class
FROM public.agents a
WHERE a.status = 'active'
ORDER BY a.tenant_id, a.agent_name;