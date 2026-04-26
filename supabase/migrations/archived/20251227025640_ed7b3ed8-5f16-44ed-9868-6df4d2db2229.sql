-- Migration 2: Add block columns to agent_versions and extend security_events

-- agent_versions: block columns for UPDATE_BLOCK rule
ALTER TABLE public.agent_versions
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS blocked_at TIMESTAMPTZ,
ADD COLUMN IF NOT EXISTS blocked_reason TEXT,
ADD COLUMN IF NOT EXISTS blocked_by TEXT;

-- security_events: add event_type and agent_name for better querying
ALTER TABLE public.security_events
ADD COLUMN IF NOT EXISTS event_type TEXT,
ADD COLUMN IF NOT EXISTS agent_name TEXT;

-- Index for blocked versions
CREATE INDEX IF NOT EXISTS idx_agent_versions_blocked ON public.agent_versions(is_blocked) WHERE is_blocked = true;

-- Index for security_events by event_type
CREATE INDEX IF NOT EXISTS idx_security_events_event_type ON public.security_events(event_type);