-- =====================================================================
-- P1 SECURITY CONSTRAINTS: Prevent plaintext secrets regression
-- =====================================================================

-- 1. Add CHECK constraint to prevent new plaintext agent_tokens
-- (Using a trigger since CHECK with subquery not allowed)
CREATE OR REPLACE FUNCTION public.prevent_plaintext_agent_token()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- P1 SEC-002: agent_token must always be NULL (use agent_tokens table instead)
  IF NEW.agent_token IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: agent_token must be NULL. Use agent_tokens table for token storage.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS enforce_no_plaintext_agent_token ON public.enrollment_keys;

CREATE TRIGGER enforce_no_plaintext_agent_token
  BEFORE INSERT OR UPDATE ON public.enrollment_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_plaintext_agent_token();

-- 2. Add constraint to require key_hash on new inserts
CREATE OR REPLACE FUNCTION public.require_key_hash()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- P1 SEC-001: key_hash must be present for new enrollment keys
  IF NEW.key_hash IS NULL THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: key_hash is required. Cannot store enrollment keys without hash.'
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$;

-- Drop trigger if exists and recreate
DROP TRIGGER IF EXISTS enforce_key_hash_required ON public.enrollment_keys;

CREATE TRIGGER enforce_key_hash_required
  BEFORE INSERT ON public.enrollment_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.require_key_hash();

-- 3. Add audit logging for enrollment key access
CREATE OR REPLACE FUNCTION public.log_enrollment_key_access()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  -- Log when enrollment key is used (current_uses incremented)
  IF TG_OP = 'UPDATE' AND OLD.current_uses < NEW.current_uses THEN
    INSERT INTO public.audit_logs (
      tenant_id,
      action,
      resource_type,
      resource_id,
      success,
      details
    ) VALUES (
      NEW.tenant_id,
      'enrollment_key_used',
      'enrollment_key',
      NEW.id::text,
      true,
      jsonb_build_object(
        'used_by_agent', NEW.used_by_agent,
        'current_uses', NEW.current_uses,
        'max_uses', NEW.max_uses
      )
    );
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS audit_enrollment_key_usage ON public.enrollment_keys;

CREATE TRIGGER audit_enrollment_key_usage
  AFTER UPDATE ON public.enrollment_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.log_enrollment_key_access();

-- 4. Add security comment for documentation
COMMENT ON TRIGGER enforce_no_plaintext_agent_token ON public.enrollment_keys IS 
  'P1 SEC-002: Prevents storing plaintext agent tokens. Tokens must be stored hashed in agent_tokens table.';

COMMENT ON TRIGGER enforce_key_hash_required ON public.enrollment_keys IS 
  'P1 SEC-001: Requires key_hash for all new enrollment keys. Plaintext key storage is deprecated.';