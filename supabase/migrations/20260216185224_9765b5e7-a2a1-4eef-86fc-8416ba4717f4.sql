
-- Add scheduling pause flag for agents pending update
ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS scheduling_paused boolean NOT NULL DEFAULT false;

ALTER TABLE public.agents 
ADD COLUMN IF NOT EXISTS scheduling_paused_reason text;

COMMENT ON COLUMN public.agents.scheduling_paused IS 'When true, the scheduler will not create new jobs for this agent';
COMMENT ON COLUMN public.agents.scheduling_paused_reason IS 'Reason why scheduling is paused (e.g. awaiting version update)';
