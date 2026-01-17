-- =============================================================================
-- ADR-026 Phase 2: Cleanup Functions Hardening (Dr. Vellum Audit)
-- =============================================================================
-- Drop and recreate cleanup_expired_keys with audit logging
-- =============================================================================

-- Drop existing function to allow recreation with different return type
DROP FUNCTION IF EXISTS public.cleanup_expired_keys();

-- Recreate with audit logging and proper return type
CREATE FUNCTION public.cleanup_expired_keys()
RETURNS integer
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_count INTEGER;
BEGIN
  -- Count keys to be deactivated
  SELECT COUNT(*) INTO v_count
  FROM public.enrollment_keys
  WHERE expires_at < now() AND is_active = true;
  
  -- Execute cleanup
  UPDATE public.enrollment_keys
  SET is_active = false, updated_at = now()
  WHERE expires_at < now() AND is_active = true;
  
  -- Log operation if any keys were deactivated
  IF v_count > 0 THEN
    INSERT INTO public.audit_logs (
      tenant_id, 
      user_id,
      action, 
      resource_type, 
      details,
      success
    ) VALUES (
      NULL, -- System operation
      NULL, -- System operation
      'cleanup_expired_keys',
      'enrollment_keys',
      jsonb_build_object(
        'deactivated_count', v_count,
        'executed_at', now()::text,
        'operation', 'scheduled_cleanup'
      ),
      true
    );
  END IF;
  
  RETURN v_count;
END;
$$;

-- Only service_role should call cleanup functions
REVOKE EXECUTE ON FUNCTION public.cleanup_expired_keys() FROM anon, authenticated, PUBLIC;

COMMENT ON FUNCTION public.cleanup_expired_keys IS 
  'ADR-026: Added audit logging for compliance. Returns count of deactivated keys.';