-- Register v3.10.0-SECURITY-FEATURES script content for auto-update functionality
-- Copy script_content from v3.9.0-AUTO-UPDATE (v3.10.0 is additive, doesn't modify core)

UPDATE agent_releases
SET 
  script_content = (
    SELECT script_content
    FROM agent_releases
    WHERE version = 'v3.9.0-AUTO-UPDATE' AND platform = 'windows'
    LIMIT 1
  ),
  sha256 = (
    SELECT sha256
    FROM agent_releases
    WHERE version = 'v3.9.0-AUTO-UPDATE' AND platform = 'windows'
    LIMIT 1
  )
WHERE version = 'v3.10.0-SECURITY-FEATURES' AND platform = 'windows';

-- Verify the update
SELECT 
  version,
  platform,
  channel,
  is_active,
  LENGTH(script_content) as script_size_bytes,
  LEFT(sha256, 16) || '...' as sha256_preview,
  created_at
FROM agent_releases
WHERE platform = 'windows'
  AND version IN ('v3.9.0-AUTO-UPDATE', 'v3.10.0-SECURITY-FEATURES')
ORDER BY created_at DESC;