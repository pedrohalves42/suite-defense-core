-- Add missing columns to agent_web_activity table
ALTER TABLE public.agent_web_activity 
  ADD COLUMN IF NOT EXISTS url_full TEXT,
  ADD COLUMN IF NOT EXISTS page_title TEXT,
  ADD COLUMN IF NOT EXISTS browser TEXT,
  ADD COLUMN IF NOT EXISTS visit_count INTEGER DEFAULT 1,
  ADD COLUMN IF NOT EXISTS total_duration_seconds INTEGER DEFAULT 0;

-- Create indexes for new columns
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_browser ON public.agent_web_activity(browser);
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_visit_count ON public.agent_web_activity(visit_count);

-- Clean up invalid job types
DELETE FROM public.jobs WHERE type = 'config';