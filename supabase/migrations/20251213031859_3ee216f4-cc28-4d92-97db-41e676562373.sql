-- ============================================
-- Recriar views criticas com security_invoker=on
-- ============================================

-- 1. agents_health_view - View de saude dos agentes
DROP VIEW IF EXISTS public.agents_health_view;
CREATE VIEW public.agents_health_view
WITH (security_invoker = on)
AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.os_type,
  a.os_version,
  a.agent_version,
  a.status,
  a.last_heartbeat,
  a.tenant_id,
  a.enrolled_at,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
    WHEN a.last_heartbeat < NOW() - INTERVAL '2 minutes' THEN 'degraded'
    ELSE 'healthy'
  END AS health_status,
  EXTRACT(EPOCH FROM (NOW() - a.last_heartbeat))::INTEGER AS seconds_since_heartbeat
FROM agents a
WHERE a.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
);

-- 2. agents_safe - View segura sem hmac_secret
DROP VIEW IF EXISTS public.agents_safe;
CREATE VIEW public.agents_safe
WITH (security_invoker = on)
AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.os_type,
  a.os_version,
  a.agent_version,
  a.status,
  a.last_heartbeat,
  a.tenant_id,
  a.enrolled_at,
  a.payload_hash
FROM agents a
WHERE a.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
);

-- 3. enrollment_keys_safe - View com chaves mascaradas
DROP VIEW IF EXISTS public.enrollment_keys_safe;
CREATE VIEW public.enrollment_keys_safe
WITH (security_invoker = on)
AS
SELECT 
  ek.id,
  ek.tenant_id,
  ek.description,
  LEFT(ek.key, 8) || '...' || RIGHT(ek.key, 4) AS key_masked,
  ek.is_active,
  ek.max_uses,
  ek.current_uses,
  ek.expires_at,
  ek.created_at,
  ek.used_at,
  ek.used_by_agent,
  ek.agent_id,
  ek.created_by
FROM enrollment_keys ek
WHERE ek.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
);

-- Comentarios de documentacao
COMMENT ON VIEW public.agents_health_view IS 'View segura de saude dos agentes - security_invoker=on garante isolamento por tenant';
COMMENT ON VIEW public.agents_safe IS 'View segura de agentes sem hmac_secret - security_invoker=on garante isolamento por tenant';
COMMENT ON VIEW public.enrollment_keys_safe IS 'View segura com chaves mascaradas - security_invoker=on garante isolamento por tenant';