-- Drop and recreate get_audit_raw_metrics function with correct table reference
-- Fixes: relation "public.user_tenants" does not exist

DROP FUNCTION IF EXISTS public.get_audit_raw_metrics(uuid, uuid);

CREATE OR REPLACE FUNCTION public.get_audit_raw_metrics(
  p_user_id uuid,
  p_tenant_id uuid
)
RETURNS jsonb
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_result jsonb;
  v_agents_count integer;
  v_users_count integer;
  v_policies_count integer;
  v_alerts_count integer;
  v_has_access boolean;
BEGIN
  -- Validate inputs
  IF p_user_id IS NULL OR p_tenant_id IS NULL THEN
    RAISE EXCEPTION 'user_id and tenant_id are required';
  END IF;

  -- Verify user has access to tenant using correct table: user_roles
  SELECT EXISTS(
    SELECT 1 FROM public.user_roles 
    WHERE user_id = p_user_id AND tenant_id = p_tenant_id
  ) INTO v_has_access;
  
  IF NOT v_has_access THEN
    RAISE EXCEPTION 'Access denied to tenant';
  END IF;

  -- Count agents for tenant
  SELECT COUNT(*) INTO v_agents_count
  FROM public.agents
  WHERE tenant_id = p_tenant_id;

  -- Count users for tenant
  SELECT COUNT(*) INTO v_users_count
  FROM public.user_roles
  WHERE tenant_id = p_tenant_id;

  -- Count security policies for tenant
  SELECT COUNT(*) INTO v_policies_count
  FROM public.security_policies
  WHERE tenant_id = p_tenant_id;

  -- Count alerts for tenant (using system_alerts table)
  SELECT COUNT(*) INTO v_alerts_count
  FROM public.system_alerts
  WHERE tenant_id = p_tenant_id
    AND created_at > NOW() - INTERVAL '24 hours';

  -- Build result
  v_result := jsonb_build_object(
    'agents_count', v_agents_count,
    'users_count', v_users_count,
    'policies_count', v_policies_count,
    'recent_alerts_count', v_alerts_count,
    'collected_at', NOW()
  );

  RETURN v_result;
END;
$$;