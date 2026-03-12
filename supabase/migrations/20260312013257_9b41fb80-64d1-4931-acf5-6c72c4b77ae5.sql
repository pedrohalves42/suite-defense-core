-- V-1019: Restrict hmac_agent_secrets view to service_role only
-- This view exposes hmac_secret and must NEVER be accessible from frontend (anon/authenticated)
DROP VIEW IF EXISTS public.hmac_agent_secrets;

-- Recreate with service_role restriction via RLS-like guard
-- Edge functions use agents table directly with service_role, so this view is unnecessary
-- But if needed internally, restrict to service_role only
CREATE OR REPLACE VIEW public.hmac_agent_secrets
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
  a.id AS agent_id,
  a.hmac_secret,
  a.tenant_id
FROM public.agents a
WHERE a.status = 'active'
  AND a.hmac_secret IS NOT NULL;

-- Revoke access from anon and authenticated roles
REVOKE ALL ON public.hmac_agent_secrets FROM anon;
REVOKE ALL ON public.hmac_agent_secrets FROM authenticated;

-- Only service_role can access this view
GRANT SELECT ON public.hmac_agent_secrets TO service_role;