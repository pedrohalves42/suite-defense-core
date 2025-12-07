-- Add category and is_blocked columns to agent_web_activity table
ALTER TABLE public.agent_web_activity 
ADD COLUMN IF NOT EXISTS category TEXT DEFAULT NULL,
ADD COLUMN IF NOT EXISTS is_blocked BOOLEAN DEFAULT false;

-- Add index for filtering by category
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_category 
ON public.agent_web_activity(category);

-- Add index for filtering blocked sites
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_is_blocked 
ON public.agent_web_activity(is_blocked) 
WHERE is_blocked = true;