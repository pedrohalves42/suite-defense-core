-- Phase 3: Create audit logging function for sensitive access
CREATE OR REPLACE FUNCTION public.log_sensitive_access(
  p_resource_type text,
  p_resource_id text,
  p_action text,
  p_details jsonb DEFAULT '{}'::jsonb
)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  -- Get user's tenant
  SELECT tenant_id INTO v_tenant_id 
  FROM user_roles 
  WHERE user_id = auth.uid() 
  LIMIT 1;

  -- Insert audit log entry
  INSERT INTO audit_logs (
    user_id,
    tenant_id,
    action,
    resource_type,
    resource_id,
    details,
    success
  ) VALUES (
    auth.uid(),
    v_tenant_id,
    p_action,
    p_resource_type,
    p_resource_id,
    p_details || jsonb_build_object('logged_at', now()),
    true
  );
END;
$$;

-- Grant execute to authenticated users
GRANT EXECUTE ON FUNCTION public.log_sensitive_access(text, text, text, jsonb) TO authenticated;