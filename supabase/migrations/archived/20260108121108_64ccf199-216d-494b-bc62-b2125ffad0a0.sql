-- =============================================================================
-- ADR-026: Multi-Tenant Isolation Functions
-- =============================================================================
-- Creates helper functions to extract and verify active tenant from JWT
-- =============================================================================

-- Function to get active tenant ID from JWT
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT NULLIF(
    current_setting('request.jwt.claims', true)::json->>'active_tenant_id',
    ''
  )::uuid;
$$;

-- Function to verify if a tenant is the active tenant
CREATE OR REPLACE FUNCTION public.is_active_tenant(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT _tenant_id = public.get_active_tenant_id();
$$;

-- Grant execute permissions to authenticated users
GRANT EXECUTE ON FUNCTION public.get_active_tenant_id() TO authenticated;
GRANT EXECUTE ON FUNCTION public.is_active_tenant(uuid) TO authenticated;

-- Documentation comments
COMMENT ON FUNCTION public.get_active_tenant_id() IS 
  'ADR-026: Extracts active_tenant_id from JWT for multi-tenant isolation';
COMMENT ON FUNCTION public.is_active_tenant(uuid) IS 
  'ADR-026: Verifies if the provided tenant ID matches the active tenant from JWT';