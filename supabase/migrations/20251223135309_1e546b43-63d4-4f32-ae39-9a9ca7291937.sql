-- Add Ed25519 capability tracking columns to agents table
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS ed25519_supported boolean DEFAULT NULL,
ADD COLUMN IF NOT EXISTS signature_mode text DEFAULT NULL;

-- Add comments for documentation
COMMENT ON COLUMN public.agents.ed25519_supported IS 'Whether the agent supports Ed25519 signature verification (requires PS 5.1+)';
COMMENT ON COLUMN public.agents.signature_mode IS 'Signature verification mode: strict (enforced) or audit_only (logged but not enforced)';