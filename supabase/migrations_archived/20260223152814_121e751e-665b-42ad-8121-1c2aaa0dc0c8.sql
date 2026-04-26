-- Add unique constraint on (version, platform) for agent_releases
-- Required for upsert with onConflict to work correctly
CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_releases_version_platform 
ON public.agent_releases (version, platform);