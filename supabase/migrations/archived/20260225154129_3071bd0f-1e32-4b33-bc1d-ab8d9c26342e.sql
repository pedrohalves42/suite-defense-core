-- Add delivery counter to detect update loops
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS force_update_delivery_count integer DEFAULT 0;

-- Add comment for documentation
COMMENT ON COLUMN public.agents.force_update_delivery_count IS 'Counter incremented each time serve-agent-update delivers a force update. Reset on confirm-force-update. Used by cleanup-stale-updates to detect loops (>5 deliveries without confirmation).';