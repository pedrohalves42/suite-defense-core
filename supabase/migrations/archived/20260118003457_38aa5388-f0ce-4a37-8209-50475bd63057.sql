-- ADR-026: Unify tenant functions + Create atomic tenant switch RPC
-- This migration:
-- 1. Deprecates current_user_tenant_id() to use get_active_tenant_id() for consistency
-- 2. Creates switch_tenant_atomic() RPC for race-condition-free tenant switching

-- ============================================================================
-- FIX 2: Unify current_user_tenant_id() with get_active_tenant_id()
-- ============================================================================

-- Redefine current_user_tenant_id to use JWT claim (same as get_active_tenant_id)
-- This ensures all RLS policies using either function have consistent behavior
CREATE OR REPLACE FUNCTION public.current_user_tenant_id()
RETURNS uuid
LANGUAGE sql
STABLE
SECURITY INVOKER
SET search_path = public
AS $$
  -- ADR-026: Now delegates to get_active_tenant_id() for consistency
  -- Previously queried user_roles directly which could return non-deterministic results
  SELECT public.get_active_tenant_id();
$$;

COMMENT ON FUNCTION public.current_user_tenant_id() IS 
'DEPRECATED in favor of get_active_tenant_id(). Now redirects to get_active_tenant_id() to ensure consistent tenant resolution via JWT claims. See ADR-026 for rationale.';

-- ============================================================================
-- FIX 4: Create switch_tenant_atomic() RPC for race-condition-free switching
-- ============================================================================

CREATE OR REPLACE FUNCTION public.switch_tenant_atomic(
  p_user_id uuid,
  p_new_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_has_access boolean;
  v_all_tenants uuid[];
  v_is_super_admin boolean;
  v_role_record record;
BEGIN
  -- 1. Atomic verification of access (uses SELECT FOR UPDATE to prevent race conditions)
  -- This locks the relevant rows during the transaction, preventing TOCTOU attacks
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles
    WHERE user_id = p_user_id 
    AND tenant_id = p_new_tenant_id
    FOR UPDATE NOWAIT
  ) INTO v_has_access;
  
  IF NOT v_has_access THEN
    RETURN jsonb_build_object(
      'success', false,
      'error', 'TENANT_ACCESS_DENIED',
      'message', 'User does not have access to the requested tenant'
    );
  END IF;
  
  -- 2. Collect all tenants and check for super_admin role atomically
  SELECT 
    ARRAY_AGG(DISTINCT tenant_id),
    BOOL_OR(role = 'super_admin')
  INTO v_all_tenants, v_is_super_admin
  FROM public.user_roles
  WHERE user_id = p_user_id;
  
  -- 3. Return success with all data needed for metadata update
  -- The edge function will use this to update app_metadata atomically
  RETURN jsonb_build_object(
    'success', true,
    'active_tenant_id', p_new_tenant_id,
    'tenants', v_all_tenants,
    'is_super_admin', COALESCE(v_is_super_admin, false),
    'tenant_count', COALESCE(array_length(v_all_tenants, 1), 0)
  );
  
EXCEPTION
  WHEN lock_not_available THEN
    -- Another process is modifying user roles - retry
    RETURN jsonb_build_object(
      'success', false,
      'error', 'CONCURRENT_MODIFICATION',
      'message', 'Tenant access is being modified. Please retry.'
    );
END;
$$;

-- Security: Only service_role can call this function
REVOKE ALL ON FUNCTION public.switch_tenant_atomic FROM PUBLIC;
GRANT EXECUTE ON FUNCTION public.switch_tenant_atomic TO service_role;

COMMENT ON FUNCTION public.switch_tenant_atomic(uuid, uuid) IS 
'ADR-026: Atomic tenant switch verification. Eliminates race condition between access check and metadata update by using row-level locking. Only callable by service_role.';