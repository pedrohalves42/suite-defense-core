-- 1. Finalize Agent Release Baseline
-- We only keep the latest stable versions active to ensure fleet consistency.
UPDATE public.agent_releases
SET is_active = false,
    channel = 'deprecated'
WHERE NOT (
  (platform = 'windows' AND version = 'v6.0.0') OR
  (platform IN ('linux', 'macos') AND version = 'v5.0.15')
);

-- 2. Ensure only the absolute latest is active per platform/channel
WITH LatestReleases AS (
  SELECT id,
         ROW_NUMBER() OVER (PARTITION BY platform, channel ORDER BY created_at DESC) as rank
  FROM public.agent_releases
  WHERE is_active = true
)
UPDATE public.agent_releases
SET is_active = false
WHERE id IN (SELECT id FROM LatestReleases WHERE rank > 1);

-- 3. HMAC Signature Rotation Maintenance
-- This function will be called by the cleanup-router or a cron job.
CREATE OR REPLACE FUNCTION public.rotate_hmac_signatures()
RETURNS VOID AS $$
BEGIN
  -- Delete signatures older than 24 hours to prevent replay table bloat
  DELETE FROM public.agent_hmac_signatures
  WHERE created_at < now() - INTERVAL '24 hours';
  
  -- Delete old audit logs of auth failures to maintain performance
  DELETE FROM public.agent_evidence_logs
  WHERE event_type = 'auth_failure' 
    AND created_at < now() - INTERVAL '30 days';
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- 4. Robustness: Ensure agents have initialized versions
UPDATE public.agents SET version = 1 WHERE version IS NULL;
UPDATE public.agents SET row_version = 1 WHERE row_version IS NULL;
