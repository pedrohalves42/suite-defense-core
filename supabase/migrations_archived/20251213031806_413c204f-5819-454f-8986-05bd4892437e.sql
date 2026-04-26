-- ============================================
-- P1-02: Views com Security Invoker (correcao)
-- ============================================

-- Recriar enrollment_keys_safe com security_invoker (key mascarada) - usando coluna correta 'description'
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

-- Recriar v_agent_health_summary com security_invoker
DROP VIEW IF EXISTS public.v_agent_health_summary;
CREATE VIEW public.v_agent_health_summary
WITH (security_invoker = on)
AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.os_type,
  a.status,
  a.last_heartbeat,
  a.tenant_id,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'never_connected'
    WHEN a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'offline'
    ELSE 'online'
  END AS connection_status
FROM agents a
WHERE a.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
);

-- Recriar v_problematic_agents com security_invoker
DROP VIEW IF EXISTS public.v_problematic_agents;
CREATE VIEW public.v_problematic_agents
WITH (security_invoker = on)
AS
SELECT 
  a.id,
  a.agent_name,
  a.hostname,
  a.os_type,
  a.status,
  a.last_heartbeat,
  a.tenant_id,
  a.enrolled_at,
  CASE
    WHEN a.last_heartbeat IS NULL THEN 'no_heartbeat'
    WHEN a.last_heartbeat < NOW() - INTERVAL '30 minutes' THEN 'stale_heartbeat'
    ELSE 'other_issue'
  END AS issue_type
FROM agents a
WHERE a.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
)
AND (
  a.last_heartbeat IS NULL 
  OR a.last_heartbeat < NOW() - INTERVAL '30 minutes'
  OR a.status = 'pending'
);

-- Recriar v_agent_lifecycle_state com security_invoker
DROP VIEW IF EXISTS public.v_agent_lifecycle_state;
CREATE VIEW public.v_agent_lifecycle_state
WITH (security_invoker = on)
AS
SELECT 
  a.id AS agent_id,
  a.agent_name,
  a.status,
  a.enrolled_at,
  a.last_heartbeat,
  a.tenant_id,
  CASE
    WHEN a.status = 'pending' AND a.last_heartbeat IS NULL THEN 'awaiting_first_heartbeat'
    WHEN a.status = 'active' AND a.last_heartbeat > NOW() - INTERVAL '5 minutes' THEN 'active_healthy'
    WHEN a.status = 'active' AND a.last_heartbeat < NOW() - INTERVAL '5 minutes' THEN 'active_stale'
    WHEN a.status = 'inactive' THEN 'deactivated'
    ELSE 'unknown'
  END AS lifecycle_state
FROM agents a
WHERE a.tenant_id IN (
  SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()
);

-- Comentarios para documentacao
COMMENT ON VIEW public.enrollment_keys_safe IS 'View segura com keys mascaradas e security_invoker - isolamento por tenant via RLS';
COMMENT ON VIEW public.v_agent_health_summary IS 'View resumo de saude dos agentes com security_invoker';
COMMENT ON VIEW public.v_problematic_agents IS 'View de agentes problematicos com security_invoker';
COMMENT ON VIEW public.v_agent_lifecycle_state IS 'View de estado do ciclo de vida dos agentes com security_invoker';