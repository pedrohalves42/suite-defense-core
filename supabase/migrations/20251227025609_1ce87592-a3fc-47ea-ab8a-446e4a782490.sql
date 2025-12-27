-- Migration 1: Add throttle and isolate columns to agents table
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS poll_interval_seconds INTEGER DEFAULT 60,
ADD COLUMN IF NOT EXISTS is_throttled BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS throttled_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS throttle_reason TEXT,
ADD COLUMN IF NOT EXISTS is_isolated BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS isolated_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS isolation_reason TEXT;

-- Add index for querying throttled/isolated agents
CREATE INDEX IF NOT EXISTS idx_agents_throttled ON public.agents(is_throttled) WHERE is_throttled = true;
CREATE INDEX IF NOT EXISTS idx_agents_isolated ON public.agents(is_isolated) WHERE is_isolated = true;