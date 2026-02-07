-- Update agent_releases: Set previous version as inactive and insert new v5.0.3
-- First, mark v5.0.2 as inactive for windows
UPDATE agent_releases 
SET is_active = false 
WHERE version = 'v5.0.2' AND platform = 'windows';

-- Update agent_versions: mark v5.0.2 as not latest
UPDATE agent_versions
SET is_latest = false
WHERE version = 'v5.0.2' AND platform = 'windows';

-- Note: The actual script content insertion will happen via sync-release-from-repo edge function
-- This migration just prepares the database state