-- PATCH #3: Fix update_user_role_rpc to use get_active_tenant_id()
-- Eliminates multi-tenant bypass by ensuring actor is admin of active tenant

CREATE OR REPLACE FUNCTION public.update_user_role_rpc(
  p_user_id uuid,
  p_new_role text
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_actor_tenant_id uuid;
  v_target_tenant_id uuid;
  v_current_role text;
  v_admin_count integer;
BEGIN
  -- PATCH #3: Use active_tenant_id from JWT (not arbitrary LIMIT 1)
  SELECT tenant_id
  INTO v_actor_tenant_id
  FROM public.user_roles
  WHERE user_id = auth.uid()
    AND role = 'admin'
    AND tenant_id = public.get_active_tenant_id();

  IF v_actor_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: user is not admin of active tenant';
  END IF;

  -- Prevent self-role change
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Cannot change own role';
  END IF;

  -- Verify target user is in same tenant
  SELECT tenant_id, role::text
  INTO v_target_tenant_id, v_current_role
  FROM public.user_roles
  WHERE user_id = p_user_id
    AND tenant_id = v_actor_tenant_id;

  IF v_target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Target user not in same tenant';
  END IF;

  -- Prevent removing last admin
  IF v_current_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT COUNT(*)
    INTO v_admin_count
    FROM public.user_roles
    WHERE tenant_id = v_actor_tenant_id
      AND role = 'admin';

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Cannot remove last admin from tenant';
    END IF;
  END IF;

  -- Update role atomically
  UPDATE public.user_roles
  SET role = p_new_role::app_role,
      updated_at = now()
  WHERE user_id = p_user_id
    AND tenant_id = v_actor_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.update_user_role_rpc(uuid, text) IS 'ADR-026: Secure role update with active tenant validation - eliminates multi-tenant bypass';