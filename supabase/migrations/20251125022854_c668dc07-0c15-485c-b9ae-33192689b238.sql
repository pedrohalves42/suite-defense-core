-- Register v3.10.0-SECURITY-FEATURES as latest version
-- Step 1: Mark all existing versions as not latest
UPDATE agent_versions SET is_latest = false WHERE platform = 'windows';
UPDATE agent_releases SET is_active = false WHERE platform = 'windows';

-- Step 2: Insert v3.10.0-SECURITY-FEATURES into agent_versions
INSERT INTO agent_versions (
  version,
  platform,
  download_url,
  sha256,
  size_bytes,
  is_latest,
  release_notes
) VALUES (
  'v3.10.0-SECURITY-FEATURES',
  'windows',
  'https://raw.githubusercontent.com/cybershield/agent/main/dist/cybershield-agent-windows-v3.10.0.ps1',
  'placeholder_sha256_will_be_updated_on_deployment',
  27500,
  true,
  'Added security features: Software Inventory collection and submission, Vulnerability Scanning with remediation suggestions, Web Activity tracking via DNS cache analysis, Automatic system metrics every 5 minutes, Report job type support for on-demand health checks'
) ON CONFLICT (version, platform) DO UPDATE
SET 
  is_latest = true,
  release_notes = EXCLUDED.release_notes;

-- Step 3: Insert v3.10.0-SECURITY-FEATURES into agent_releases
INSERT INTO agent_releases (
  version,
  platform,
  channel,
  script_content,
  sha256,
  is_active,
  release_notes
) 
SELECT 
  'v3.10.0-SECURITY-FEATURES',
  'windows',
  'stable',
  script_content,
  'placeholder_sha256_will_be_updated_on_deployment',
  true,
  'Added security features: Software Inventory collection and submission, Vulnerability Scanning with remediation suggestions, Web Activity tracking via DNS cache analysis, Automatic system metrics every 5 minutes, Report job type support for on-demand health checks'
FROM agent_releases 
WHERE version = 'v3.9.0-AUTO-UPDATE' AND platform = 'windows'
ON CONFLICT (version, platform, channel) DO UPDATE
SET 
  is_active = true,
  release_notes = EXCLUDED.release_notes;

-- Step 4: Update the script_content to v3.10.0 by copying from the embedded content
-- This will be handled by the register-agent-release Edge Function during deployment
-- For now, we use v3.9.0 content as placeholder and mark it for update

COMMENT ON TABLE agent_releases IS 'Agent releases table updated with v3.10.0-SECURITY-FEATURES. Script content will be synced via register-agent-release Edge Function.';