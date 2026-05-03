-- 1. Redefine get_active_tenant_id with mandatory membership verification
-- This prevents "Claim Injection" attacks where a user might try to spoof the active_tenant_id
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE SECURITY DEFINER
SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $$
DECLARE
  v_claim text;
  v_user_id uuid;
BEGIN
  -- Extract the claim from the current session context
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  v_user_id := auth.uid();

  -- No claim or no user means no active tenant
  IF v_claim IS NULL OR v_claim = '' OR v_user_id IS NULL THEN
    RETURN NULL;
  END IF;

  -- CRITICAL: Mandatory cross-check against user_roles table
  -- A user CANNOT set an active tenant they don't actually belong to.
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = v_user_id 
    AND tenant_id = v_claim::uuid
  ) OR public.is_current_super_admin() THEN
    RETURN v_claim::uuid;
  END IF;

  -- If membership is not verified, fail closed
  RETURN NULL;
END;
$$;

-- 2. Lockdown sensitive RPC functions
-- Revoke all permissions from public/anon/authenticated and grant only to service_role
REVOKE ALL ON FUNCTION public.hmac_check_and_record(text, text) FROM public;
REVOKE ALL ON FUNCTION public.hmac_check_and_record(text, text) FROM anon;
REVOKE ALL ON FUNCTION public.hmac_check_and_record(text, text) FROM authenticated;
GRANT EXECUTE ON FUNCTION public.hmac_check_and_record(text, text) TO service_role;

-- 3. Hardened RLS for the Agents table (Zero-Trust)
-- Drop legacy or potentially weak policies
DROP POLICY IF EXISTS agents_active_tenant_isolation ON public.agents;
DROP POLICY IF EXISTS agents_insert_active_tenant ON public.agents;
DROP POLICY IF EXISTS agents_update_active_tenant ON public.agents;

CREATE POLICY agents_tenant_isolation_select ON public.agents
FOR SELECT TO authenticated
USING (
  (tenant_id = public.get_active_tenant_id())
  OR 
  (public.is_current_super_admin())
);

CREATE POLICY agents_tenant_isolation_insert ON public.agents
FOR INSERT TO authenticated
WITH CHECK (
  (tenant_id = public.get_active_tenant_id())
  OR 
  (public.is_current_super_admin())
);

CREATE POLICY agents_tenant_isolation_update ON public.agents
FOR UPDATE TO authenticated
USING (
  (tenant_id = public.get_active_tenant_id())
  OR 
  (public.is_current_super_admin())
)
WITH CHECK (
  (tenant_id = public.get_active_tenant_id())
  OR 
  (public.is_current_super_admin())
);
