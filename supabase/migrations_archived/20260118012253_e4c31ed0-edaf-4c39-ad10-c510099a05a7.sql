-- PATCH #1: get_active_tenant_id() with security logging
-- Adds audit logging when active_tenant_id claim is missing from JWT

CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_id uuid;
BEGIN
  v_tenant_id := NULLIF(
    current_setting('request.jwt.claims', true)::json->>'active_tenant_id',
    ''
  )::uuid;

  IF v_tenant_id IS NULL THEN
    RAISE LOG 'SECURITY: get_active_tenant_id() returned NULL (missing active_tenant_id claim)';
  END IF;

  RETURN v_tenant_id;
END;
$$;

COMMENT ON FUNCTION public.get_active_tenant_id() IS 'ADR-026: Returns active_tenant_id from JWT with security logging for NULL cases';