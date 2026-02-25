-- Add signature columns to agent_releases for ECDSA signing support
ALTER TABLE public.agent_releases
  ADD COLUMN IF NOT EXISTS signature TEXT,
  ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signed_by TEXT;

-- Add index for quick lookup of signed releases
CREATE INDEX IF NOT EXISTS idx_agent_releases_signed 
  ON public.agent_releases (is_active, platform) 
  WHERE signature IS NOT NULL;

COMMENT ON COLUMN public.agent_releases.signature IS 'ECDSA P-256 digital signature of script_content';
COMMENT ON COLUMN public.agent_releases.signed_at IS 'Timestamp when the release was signed';
COMMENT ON COLUMN public.agent_releases.signed_by IS 'Identity of the signer (e.g. super_admin email or CI pipeline)';