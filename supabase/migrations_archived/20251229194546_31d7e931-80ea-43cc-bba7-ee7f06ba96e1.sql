-- Add column for force update override safe mode
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS force_update_override_safe_mode boolean DEFAULT false;

COMMENT ON COLUMN public.agents.force_update_override_safe_mode IS 
  'When true, force_update will ignore local safe_mode state on the agent';