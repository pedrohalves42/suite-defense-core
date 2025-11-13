-- Add github_run_url column to agent_builds table
ALTER TABLE public.agent_builds 
ADD COLUMN IF NOT EXISTS github_run_url TEXT;

COMMENT ON COLUMN public.agent_builds.github_run_url IS 'Direct URL to GitHub Actions run logs for monitoring build progress';