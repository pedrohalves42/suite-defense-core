-- Add missing columns to agent_signing_keys referenced by register_agent_signing_key RPC
ALTER TABLE public.agent_signing_keys 
  ADD COLUMN IF NOT EXISTS is_active boolean NOT NULL DEFAULT true,
  ADD COLUMN IF NOT EXISTS valid_until timestamptz;

-- Create index for active key lookups
CREATE INDEX IF NOT EXISTS idx_agent_signing_keys_active 
  ON public.agent_signing_keys (agent_id, is_active) 
  WHERE is_active = true;