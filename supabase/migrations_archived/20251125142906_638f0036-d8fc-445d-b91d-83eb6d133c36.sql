-- =====================================================
-- Migration: Register Agent v3.10.3-TLS-COMPLETE
-- Purpose: Register new agent version in agent_releases and agent_versions tables
-- Date: 2025-01-25
-- =====================================================

-- Step 1: Deactivate previous versions
UPDATE agent_releases 
SET is_active = false 
WHERE platform = 'windows' AND is_active = true;

UPDATE agent_versions 
SET is_latest = false 
WHERE platform = 'windows' AND is_latest = true;

-- Step 2: Insert new release into agent_releases
-- Note: script_content and SHA256 will be populated by the register-agent-release Edge Function
-- This migration creates placeholder entries that will be updated by the Edge Function

INSERT INTO agent_releases (
    platform,
    version,
    channel,
    script_content,
    sha256,
    release_notes,
    is_active,
    created_by
)
SELECT
    'windows' as platform,
    'v3.10.3-TLS-COMPLETE' as version,
    'stable' as channel,
    'PLACEHOLDER - Will be updated by Edge Function' as script_content,
    'placeholder' as sha256,
    'Critical TLS 1.2 enforcement in 3 layers: (1) Installation command, (2) Installer template, (3) Agent script. Resolves SSL/TLS errors in Windows Server corporate firewall environments (pfSense). Includes aggressive cleanup of locked PowerShell processes during reinstallation and system proxy auto-configuration.' as release_notes,
    true as is_active,
    NULL as created_by
WHERE NOT EXISTS (
    SELECT 1 FROM agent_releases 
    WHERE platform = 'windows' 
    AND version = 'v3.10.3-TLS-COMPLETE'
    AND channel = 'stable'
);

-- Step 3: Insert into agent_versions
-- Note: Real script content and SHA256 will be updated via register-agent-release Edge Function
INSERT INTO agent_versions (
    platform,
    version,
    is_latest,
    sha256,
    size_bytes,
    download_url,
    release_notes
)
SELECT
    'windows' as platform,
    'v3.10.3-TLS-COMPLETE' as version,
    true as is_latest,
    'placeholder' as sha256,
    0 as size_bytes,
    (SELECT CONCAT(current_setting('app.settings.supabase_url', true), '/functions/v1/serve-agent-update')) as download_url,
    'Critical TLS 1.2 enforcement in 3 layers: (1) Installation command, (2) Installer template, (3) Agent script. Resolves SSL/TLS errors in Windows Server corporate firewall environments (pfSense). Includes aggressive cleanup of locked PowerShell processes during reinstallation and system proxy auto-configuration.' as release_notes
WHERE NOT EXISTS (
    SELECT 1 FROM agent_versions 
    WHERE platform = 'windows' 
    AND version = 'v3.10.3-TLS-COMPLETE'
)
ON CONFLICT (platform, version) DO UPDATE
SET 
    is_latest = true,
    sha256 = EXCLUDED.sha256,
    size_bytes = EXCLUDED.size_bytes,
    download_url = EXCLUDED.download_url,
    release_notes = EXCLUDED.release_notes;

-- Verification query
SELECT 
    'agent_releases' as table_name,
    platform,
    version,
    channel,
    is_active,
    length(script_content) as script_length,
    substring(sha256, 1, 16) || '...' as sha256_preview,
    created_at
FROM agent_releases
WHERE platform = 'windows'
ORDER BY created_at DESC
LIMIT 3;

SELECT 
    'agent_versions' as table_name,
    platform,
    version,
    is_latest,
    substring(sha256, 1, 16) || '...' as sha256_preview,
    size_bytes,
    created_at
FROM agent_versions
WHERE platform = 'windows'
ORDER BY created_at DESC
LIMIT 3;