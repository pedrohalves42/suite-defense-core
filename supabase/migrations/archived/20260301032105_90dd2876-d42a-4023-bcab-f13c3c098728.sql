
-- Fix _assert_caller_tenant to allow service_role callers (used by edge functions)
CREATE OR REPLACE FUNCTION public._assert_caller_tenant(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: p_tenant_id cannot be null (INV-001)';
  END IF;
  
  -- Service role (edge functions, crons) can access any tenant
  -- current_setting('role') is 'authenticated' for normal users, not set or different for service_role
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    RETURN; -- service_role bypass
  END IF;
  
  -- For authenticated users, validate tenant ownership
  IF NOT is_current_super_admin() 
     AND (get_active_tenant_id() IS NULL OR p_tenant_id IS DISTINCT FROM get_active_tenant_id()) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: Caller tenant % does not match requested tenant % (INV-001)', 
      get_active_tenant_id(), p_tenant_id;
  END IF;
END;
$function$;
