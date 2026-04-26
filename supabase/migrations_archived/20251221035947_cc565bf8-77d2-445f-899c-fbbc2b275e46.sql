-- =====================================================================
-- P1 SECURITY FIX: Migrate enrollment_keys to hash-only
-- Remove plaintext secrets from database
-- =====================================================================

-- 1. Add key_hash column if not exists
ALTER TABLE public.enrollment_keys 
ADD COLUMN IF NOT EXISTS key_hash TEXT;

-- 2. Create index for key_hash lookups
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_key_hash 
ON public.enrollment_keys(key_hash) WHERE is_active = true;

-- 3. Migrate existing keys to hashes (idempotent)
UPDATE public.enrollment_keys
SET key_hash = encode(sha256(key::bytea), 'hex')
WHERE key IS NOT NULL 
  AND key_hash IS NULL;

-- 4. Set all agent_token to NULL (P1 SEC-002 fix)
-- serve-installer will now fetch from agent_tokens table
UPDATE public.enrollment_keys
SET agent_token = NULL
WHERE agent_token IS NOT NULL;

-- 5. Add function to hash enrollment keys consistently
CREATE OR REPLACE FUNCTION public.hash_enrollment_key_secure(p_key TEXT)
RETURNS TEXT
LANGUAGE sql
IMMUTABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT encode(sha256(p_key::bytea), 'hex');
$$;

-- 6. Create RPC for validating enrollment key by hash
CREATE OR REPLACE FUNCTION public.validate_enrollment_key_by_hash(
  p_key_hash TEXT
)
RETURNS TABLE (
  id UUID,
  tenant_id UUID,
  agent_id UUID,
  expires_at TIMESTAMPTZ,
  max_uses INTEGER,
  current_uses INTEGER,
  is_active BOOLEAN
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    ek.id,
    ek.tenant_id,
    ek.agent_id,
    ek.expires_at,
    ek.max_uses,
    ek.current_uses,
    ek.is_active
  FROM public.enrollment_keys ek
  WHERE ek.key_hash = p_key_hash
    AND ek.is_active = true
    AND ek.expires_at > NOW()
  ORDER BY ek.created_at DESC
  LIMIT 1;
END;
$$;

-- 7. Add comment explaining security change
COMMENT ON COLUMN public.enrollment_keys.key IS 
  'DEPRECATED: Will be removed. Use key_hash for validation. 
   Migration in progress - do not store new plaintext keys.';

COMMENT ON COLUMN public.enrollment_keys.agent_token IS 
  'DEPRECATED: Always NULL. Token fetched from agent_tokens table via agent_id.
   This column kept for backward compatibility only.';

COMMENT ON COLUMN public.enrollment_keys.key_hash IS 
  'SHA-256 hash of enrollment key. Used for secure validation without storing plaintext.';