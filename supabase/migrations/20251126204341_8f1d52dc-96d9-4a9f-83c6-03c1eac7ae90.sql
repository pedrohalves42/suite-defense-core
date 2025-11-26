-- ================================================================
-- MIGRATION: Delete corrupted agent_releases v3.10.9-PSCUSTOMOBJECT-FIX
-- ================================================================
-- Root cause: script_content was corrupted (49 chars instead of ~50000)
-- Fix: Delete corrupted release to allow re-registration via Edge Function

DELETE FROM public.agent_releases 
WHERE version = 'v3.10.9-PSCUSTOMOBJECT-FIX' 
  AND platform = 'windows';

-- Note: Re-registration will be done automatically via register-agent-release Edge Function
-- which ensures correct SHA256 calculation and script content extraction