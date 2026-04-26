-- Delete incorrect v3.10.14-NO-EXIT-ON-UPDATE registration with wrong script_content
-- This version was registered with v3.10.13 script content, causing auto-updates to fail
DELETE FROM agent_releases 
WHERE version = 'v3.10.14-NO-EXIT-ON-UPDATE' 
  AND platform = 'windows';

-- Re-register v3.10.14-NO-EXIT-ON-UPDATE with correct script_content
-- Script content will be provided by re-registration via AgentReleases UI
-- or via separate INSERT after this deletion completes

-- Verify deletion
SELECT 
  version,
  platform,
  channel,
  is_active,
  LENGTH(script_content) as script_length,
  created_at
FROM agent_releases
WHERE platform = 'windows'
ORDER BY created_at DESC
LIMIT 5;