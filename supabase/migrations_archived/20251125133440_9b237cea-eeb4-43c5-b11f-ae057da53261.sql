-- =====================================================
-- Migration: Fix v3.10.3-TLS-COMPLETE release records
-- =====================================================
-- This migration corrects agent_releases and agent_versions
-- for v3.10.3-TLS-COMPLETE by:
-- 1. Deactivating all other versions
-- 2. Recalculating SHA256 and size from stored script_content
-- 3. Marking v3.10.3-TLS-COMPLETE as active and latest

-- Step 1: Deactivate all other agent_releases
UPDATE public.agent_releases
SET is_active = false
WHERE version != 'v3.10.3-TLS-COMPLETE';

-- Step 2: Update v3.10.3-TLS-COMPLETE in agent_releases
-- Recalculate SHA256 from script_content and mark as active
UPDATE public.agent_releases
SET 
  is_active = true,
  sha256 = encode(digest(script_content, 'sha256'), 'hex'),
  created_at = NOW()
WHERE version = 'v3.10.3-TLS-COMPLETE'
  AND platform = 'windows';

-- Step 3: Mark all other versions as not latest in agent_versions
UPDATE public.agent_versions
SET is_latest = false
WHERE platform = 'windows'
  AND version != 'v3.10.3-TLS-COMPLETE';

-- Step 4: Update or insert v3.10.3-TLS-COMPLETE in agent_versions
-- Fetch data from agent_releases to populate agent_versions
DO $$
DECLARE
  v_sha256 TEXT;
  v_script_size BIGINT;
  v_download_url TEXT;
BEGIN
  -- Get SHA256 and size from agent_releases
  SELECT 
    sha256,
    LENGTH(script_content),
    'https://iavbnmduxpxhwubqrzzn.supabase.co/functions/v1/serve-agent-update?platform=windows'
  INTO v_sha256, v_script_size, v_download_url
  FROM public.agent_releases
  WHERE version = 'v3.10.3-TLS-COMPLETE'
    AND platform = 'windows'
  LIMIT 1;

  -- Insert or update agent_versions
  INSERT INTO public.agent_versions (
    version,
    platform,
    sha256,
    size_bytes,
    download_url,
    is_latest,
    release_notes,
    created_at
  )
  VALUES (
    'v3.10.3-TLS-COMPLETE',
    'windows',
    v_sha256,
    v_script_size,
    v_download_url,
    true,
    'Critical fix: TLS 1.2 enforcement in installation command, installer template, and agent script. Automatic system proxy configuration. Resolves SSL/TLS errors in corporate firewall environments.',
    NOW()
  )
  ON CONFLICT (version, platform)
  DO UPDATE SET
    sha256 = EXCLUDED.sha256,
    size_bytes = EXCLUDED.size_bytes,
    is_latest = true,
    release_notes = EXCLUDED.release_notes,
    created_at = NOW();
END $$;

-- Step 5: Log the update for verification
DO $$
DECLARE
  v_releases_count INT;
  v_versions_count INT;
BEGIN
  SELECT COUNT(*) INTO v_releases_count
  FROM public.agent_releases
  WHERE version = 'v3.10.3-TLS-COMPLETE' AND is_active = true;

  SELECT COUNT(*) INTO v_versions_count
  FROM public.agent_versions
  WHERE version = 'v3.10.3-TLS-COMPLETE' AND is_latest = true;

  RAISE NOTICE 'Migration complete: v3.10.3-TLS-COMPLETE marked as active in % release(s) and latest in % version(s)',
    v_releases_count, v_versions_count;
END $$;