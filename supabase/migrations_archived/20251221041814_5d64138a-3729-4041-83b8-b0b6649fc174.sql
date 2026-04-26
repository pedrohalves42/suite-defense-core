-- ============================================
-- P1 SECURITY FIX: Zero Plaintext Enrollment Keys
-- ============================================

-- PHASE 0: Allow NULL in key column (was NOT NULL)
ALTER TABLE public.enrollment_keys ALTER COLUMN key DROP NOT NULL;

-- PHASE 1: Clean existing plaintext keys (163 records)
UPDATE public.enrollment_keys 
SET key = NULL 
WHERE key IS NOT NULL;

-- PHASE 2: Create trigger function to BLOCK plaintext key storage
CREATE OR REPLACE FUNCTION public.prevent_plaintext_enrollment_key()
RETURNS TRIGGER AS $$
BEGIN
  -- P1 SEC-001: Plaintext enrollment key is forbidden
  IF NEW.key IS NOT NULL THEN
    RAISE EXCEPTION 'SECURITY_VIOLATION: Plaintext enrollment key is forbidden. Use key_hash only.'
      USING ERRCODE = '23514'; -- check_violation
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- PHASE 3: Create trigger on enrollment_keys table
DROP TRIGGER IF EXISTS enforce_no_plaintext_enrollment_key ON public.enrollment_keys;
CREATE TRIGGER enforce_no_plaintext_enrollment_key
  BEFORE INSERT OR UPDATE ON public.enrollment_keys
  FOR EACH ROW
  EXECUTE FUNCTION public.prevent_plaintext_enrollment_key();

-- Add documentation comment
COMMENT ON TRIGGER enforce_no_plaintext_enrollment_key ON public.enrollment_keys IS 
  'P1 Security: Prevents storage of plaintext enrollment keys. Only key_hash allowed.';

COMMENT ON COLUMN public.enrollment_keys.key IS 
  'DEPRECATED: Always NULL. Plaintext keys are forbidden. Use key_hash for validation.';