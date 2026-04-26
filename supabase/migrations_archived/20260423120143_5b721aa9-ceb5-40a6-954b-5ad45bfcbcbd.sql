ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS last_telemetry_at TIMESTAMP WITH TIME ZONE;

-- Comment for documentation
COMMENT ON COLUMN public.agents.last_telemetry_at IS 'Last time system metrics or processes were recorded for this agent. Used for throttling.';