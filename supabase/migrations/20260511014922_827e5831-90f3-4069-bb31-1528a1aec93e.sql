-- Fix get_active_tenant_id to be more resilient
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
DECLARE
  v_claim text;
  v_user_id uuid;
  v_fallback_tenant_id uuid;
BEGIN
  v_user_id := auth.uid();
  IF v_user_id IS NULL THEN RETURN NULL; END IF;

  -- 1. Try JWT claim first (Standard path)
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  
  IF v_claim IS NOT NULL AND v_claim <> '' THEN
    -- Cross-check JWT claim against user_roles to prevent spoofing
    IF EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = v_user_id 
      AND tenant_id = v_claim::uuid
    ) OR public.is_current_super_admin() THEN
      RETURN v_claim::uuid;
    END IF;
  END IF;

  -- 2. Fallback: If no claim or invalid claim, pick the first tenant the user belongs to
  -- This ensures RLS still works even if the JWT hasn't synchronized the claim yet.
  SELECT tenant_id INTO v_fallback_tenant_id
  FROM public.user_roles
  WHERE user_id = v_user_id
  ORDER BY created_at ASC
  LIMIT 1;

  RETURN v_fallback_tenant_id;
END;
$function$;

-- Refactor _assert_caller_tenant to check membership directly in DB
CREATE OR REPLACE FUNCTION public._assert_caller_tenant(p_tenant_id uuid)
 RETURNS void
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  IF p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'TENANT_REQUIRED: p_tenant_id cannot be null (INV-001)';
  END IF;
  
  -- Service role (edge functions, crons) can access any tenant
  IF current_setting('role', true) IS DISTINCT FROM 'authenticated' THEN
    RETURN; -- service_role bypass
  END IF;
  
  -- For authenticated users, validate tenant ownership directly in user_roles
  -- This is more robust than relying on the JWT claim which might be stale.
  IF NOT is_current_super_admin() 
     AND NOT EXISTS (
       SELECT 1 FROM public.user_roles 
       WHERE user_id = auth.uid() 
       AND tenant_id = p_tenant_id
     ) THEN
    RAISE EXCEPTION 'TENANT_MISMATCH: Caller does not have access to tenant % (INV-001)', p_tenant_id;
  END IF;
END;
$function$;

-- Ensure get_agents_list uses the new logic
CREATE OR REPLACE FUNCTION public.get_agents_list(p_tenant_id uuid, p_include_archived boolean DEFAULT false)
 RETURNS SETOF jsonb
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public', 'pg_catalog', 'pg_temp'
AS $function$
BEGIN
  -- Use the robust assertion logic
  PERFORM public._assert_caller_tenant(p_tenant_id);

  RETURN QUERY
  SELECT jsonb_build_object(
    'id', id, 'tenant_id', tenant_id, 'agent_name', agent_name,
    'hostname', hostname, 'status', status, 'os_type', os_type,
    'os_version', os_version, 'agent_version', agent_version,
    'agent_version_code', agent_version_code, 'display_name', display_name,
    'enrolled_at', enrolled_at, 'last_heartbeat', last_heartbeat,
    'last_block_sync_at', last_block_sync_at, 'agent_state', agent_state,
    'is_throttled', is_throttled, 'is_isolated', is_isolated,
    'skip_firewall_remediation', COALESCE(skip_firewall_remediation, false),
    'archived_at', archived_at
  )
  FROM agents
  WHERE tenant_id = p_tenant_id
    AND (p_include_archived OR archived_at IS NULL);
END;
$function$;
