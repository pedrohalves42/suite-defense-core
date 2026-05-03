-- 1. Hardened has_role with optional tenant validation (Fixing enum cast)
CREATE OR REPLACE FUNCTION public.has_role(_user_id uuid, _role text, _tenant_id uuid DEFAULT NULL)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1
    FROM public.user_roles
    WHERE user_id = _user_id
    AND role = _role::public.app_role
    AND (_tenant_id IS NULL OR tenant_id = _tenant_id)
  );
$$;

-- 2. Performance: Trigram indexes for efficient agent name/hostname resolution
CREATE EXTENSION IF NOT EXISTS pg_trgm;

CREATE INDEX IF NOT EXISTS idx_agents_name_trgm ON public.agents USING gin (agent_name gin_trgm_ops);
CREATE INDEX IF NOT EXISTS idx_agents_hostname_trgm ON public.agents USING gin (hostname gin_trgm_ops);

-- 3. Maintenance: Cleanup old HMAC signatures (Retain only last 24h of nonces)
CREATE OR REPLACE FUNCTION public.cleanup_hmac_nonces()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.agent_hmac_signatures
  WHERE created_at < now() - interval '24 hours';
END;
$$;

-- 4. Audit: Ensure hmac_check_and_record is restricted
-- Revoke from public/anon and grant to service_role (used by Edge Functions)
REVOKE ALL ON FUNCTION public.hmac_check_and_record(text, text) FROM public;
REVOKE ALL ON FUNCTION public.hmac_check_and_record(text, text) FROM anon;
GRANT EXECUTE ON FUNCTION public.hmac_check_and_record(text, text) TO service_role;

-- 5. Cleanup legacy fragile RPC (The 4-argument version)
DROP FUNCTION IF EXISTS public.hmac_check_and_record(uuid, text, jsonb, text);
