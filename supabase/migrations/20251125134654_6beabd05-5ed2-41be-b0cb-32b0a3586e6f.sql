-- Migration: Prepare agent releases for production readiness
-- This migration ensures at least one version is marked as latest/active
-- and prepares the system for v3.10.3-TLS-COMPLETE registration

-- Step 1: Mark v3.10.2-TLS-FIX as is_latest in agent_versions if it exists and has valid script
UPDATE agent_versions
SET is_latest = true
WHERE platform = 'windows'
  AND version = 'v3.10.2-TLS-FIX'
  AND is_latest = false;

-- Step 2: Ensure only one version per platform is marked as is_latest
UPDATE agent_versions
SET is_latest = false
WHERE platform = 'windows'
  AND version != 'v3.10.2-TLS-FIX'
  AND is_latest = true;

-- Step 3: Mark v3.10.2-TLS-FIX as is_active in agent_releases if it exists
UPDATE agent_releases
SET is_active = true
WHERE platform = 'windows'
  AND version = 'v3.10.2-TLS-FIX'
  AND is_active = false
  AND LENGTH(script_content) > 50000; -- Only if script is valid (>50KB)

-- Step 4: Create indexes for better performance on agent update queries
CREATE INDEX IF NOT EXISTS idx_agent_releases_active_platform 
ON agent_releases(platform, is_active) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_agent_versions_latest_platform 
ON agent_versions(platform, is_latest) 
WHERE is_latest = true;

-- Step 5: Add helpful comment
COMMENT ON TABLE agent_releases IS 'Stores complete agent script releases with version tracking. Use register-agent-release Edge Function to add new versions.';
COMMENT ON TABLE agent_versions IS 'Tracks agent version metadata for auto-update system. Automatically populated by register-agent-release Edge Function.';