-- CRITICAL SECURITY FIX: Block super_admin privilege escalation in update_user_role_rpc
-- 
-- This migration prevents regular admins from promoting themselves or others to super_admin role.
-- super_admin can only be assigned via direct SQL operations by database administrators.

CREATE OR REPLACE FUNCTION public.update_user_role_rpc(p_user_id uuid, p_new_role app_role)
 RETURNS jsonb
 LANGUAGE plpgsql
 SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_actor_tenant_id uuid;
  v_target_tenant_id uuid;
  v_old_role app_role;
  v_admin_count integer;
BEGIN
  -- CRITICAL SECURITY: Block super_admin assignment
  IF p_new_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot assign super_admin role through this function. Contact system administrator.' 
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Verificar se o ator está autenticado
  IF auth.uid() IS NULL THEN
    RAISE EXCEPTION 'Unauthorized: Authentication required';
  END IF;

  -- Buscar tenant_id do ator
  SELECT tenant_id INTO v_actor_tenant_id
  FROM public.user_roles
  WHERE user_id = auth.uid() AND role = 'admin'
  LIMIT 1;

  IF v_actor_tenant_id IS NULL THEN
    RAISE EXCEPTION 'Forbidden: Only admins can update roles';
  END IF;

  -- Buscar tenant_id e role atual do usuário alvo
  SELECT tenant_id, role INTO v_target_tenant_id, v_old_role
  FROM public.user_roles
  WHERE user_id = p_user_id
  LIMIT 1;

  IF v_target_tenant_id IS NULL THEN
    RAISE EXCEPTION 'User not found';
  END IF;

  -- Verificar se estão no mesmo tenant
  IF v_target_tenant_id != v_actor_tenant_id THEN
    RAISE EXCEPTION 'Forbidden: Cannot update users from different tenants';
  END IF;

  -- CRITICAL SECURITY: Block modification of existing super_admins
  IF v_old_role = 'super_admin' THEN
    RAISE EXCEPTION 'Cannot modify super_admin role. Contact system administrator.'
      USING ERRCODE = 'insufficient_privilege';
  END IF;

  -- Impedir admin de mudar o próprio role
  IF p_user_id = auth.uid() THEN
    RAISE EXCEPTION 'Bad Request: Cannot change your own role';
  END IF;

  -- Impedir remoção do último admin
  IF v_old_role = 'admin' AND p_new_role != 'admin' THEN
    SELECT COUNT(*) INTO v_admin_count
    FROM public.user_roles
    WHERE role = 'admin' AND tenant_id = v_actor_tenant_id;

    IF v_admin_count <= 1 THEN
      RAISE EXCEPTION 'Bad Request: Cannot demote the last admin';
    END IF;
  END IF;

  -- Atualizar role
  UPDATE public.user_roles
  SET role = p_new_role
  WHERE user_id = p_user_id;

  -- Criar audit log
  INSERT INTO public.audit_logs (
    tenant_id,
    user_id,
    actor_id,
    action,
    resource_type,
    resource_id,
    success,
    details
  ) VALUES (
    v_actor_tenant_id,
    auth.uid(),
    auth.uid(),
    'update_role',
    'user',
    p_user_id::text,
    true,
    jsonb_build_object(
      'before', jsonb_build_object('role', v_old_role),
      'after', jsonb_build_object('role', p_new_role),
      'blocked_super_admin_escalation', true
    )
  );

  RETURN jsonb_build_object(
    'success', true,
    'user_id', p_user_id,
    'old_role', v_old_role,
    'new_role', p_new_role
  );
END;
$function$;

-- Log this critical security fix
COMMENT ON FUNCTION public.update_user_role_rpc IS 
'SECURITY: Blocks super_admin privilege escalation. Only database admins can assign super_admin role via direct SQL.';