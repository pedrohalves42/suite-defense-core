-- =============================================
-- ADR-024: Security hardening for exposed views
-- =============================================

-- 1. Recreate profiles_public view with security_invoker
DROP VIEW IF EXISTS public.profiles_public;

CREATE VIEW public.profiles_public
WITH (security_invoker = on) AS
SELECT 
  id,
  username,
  full_name,
  created_at
FROM public.profiles;

-- Grant access to authenticated users only
REVOKE ALL ON public.profiles_public FROM anon;
GRANT SELECT ON public.profiles_public TO authenticated;

-- 2. Recreate audit_logs_safe view with security_invoker
-- Excludes sensitive columns: ip_address, user_agent, details, state_before, state_after
DROP VIEW IF EXISTS public.audit_logs_safe;

CREATE VIEW public.audit_logs_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  user_id,
  tenant_id,
  action,
  resource_type,
  resource_id,
  success,
  created_at
FROM public.audit_logs;

-- Grant access to authenticated users only
REVOKE ALL ON public.audit_logs_safe FROM anon;
GRANT SELECT ON public.audit_logs_safe TO authenticated;

-- 3. Recreate active_agents view with security_invoker
-- Excludes sensitive columns: hmac_secret, payload_hash, result_public_key, etc.
DROP VIEW IF EXISTS public.active_agents;

CREATE VIEW public.active_agents
WITH (security_invoker = on) AS
SELECT 
  id,
  agent_name,
  display_name,
  hostname,
  status,
  tenant_id,
  last_heartbeat,
  agent_version,
  os_type,
  os_version,
  enrolled_at
FROM public.agents
WHERE archived_at IS NULL;

-- Grant access to authenticated users only
REVOKE ALL ON public.active_agents FROM anon;
GRANT SELECT ON public.active_agents TO authenticated;

-- 4. Add comments for documentation
COMMENT ON VIEW public.profiles_public IS 'Public-safe profile data with security_invoker enabled - ADR-024';
COMMENT ON VIEW public.audit_logs_safe IS 'Audit logs without sensitive details, security_invoker enabled - ADR-024';
COMMENT ON VIEW public.active_agents IS 'Active (non-archived) agents with security_invoker enabled - ADR-024';