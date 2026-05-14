CREATE OR REPLACE FUNCTION public.get_active_tenant_id() RETURNS uuid
    LANGUAGE plpgsql STABLE SECURITY DEFINER
    SET search_path TO 'public'
    AS $$
DECLARE
  v_claim text;
  v_tenant_id uuid;
  v_is_super_admin boolean;
BEGIN
  -- 1. Extract active_tenant_id claim from JWT
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  
  IF v_claim IS NULL OR v_claim = '' THEN
    RETURN NULL;
  END IF;

  v_tenant_id := v_claim::uuid;

  -- 2. Check for super_admin role (cached check)
  -- is_current_super_admin() is already SECURITY DEFINER and STABLE
  v_is_super_admin := is_current_super_admin();
  
  IF v_is_super_admin THEN
    RETURN v_tenant_id;
  END IF;

  -- 3. SSA-SEC HARDENING: Verify user still belongs to this tenant in user_roles table
  -- This prevents "zombie session" access after removal from tenant but before JWT expiry
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND tenant_id = v_tenant_id
  ) THEN
    RETURN v_tenant_id;
  END IF;

  -- 4. If claim exists but user no longer belongs to tenant, return NULL
  -- This will trigger RLS failures for the requests, as intended.
  RETURN NULL;
END;
$$;

COMMENT ON FUNCTION public.get_active_tenant_id() IS 'ADR-028 P3-01: Returns active tenant from JWT. SSA-SEC HARDENED: Validates user membership in user_roles table to prevent zombie session access after tenant removal.';
