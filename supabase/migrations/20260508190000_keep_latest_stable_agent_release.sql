-- Keep only the newest stable active backend release per platform.
-- Older stable rows remain as audit history but are not active candidates.
WITH ranked_releases AS (
  SELECT
    id,
    ROW_NUMBER() OVER (
      PARTITION BY platform
      ORDER BY created_at DESC, id DESC
    ) AS release_rank
  FROM public.agent_releases
  WHERE channel = 'stable'
    AND is_active = true
)
UPDATE public.agent_releases ar
SET is_active = false
FROM ranked_releases rr
WHERE ar.id = rr.id
  AND rr.release_rank > 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_agent_releases_one_active_stable_per_platform
  ON public.agent_releases(platform)
  WHERE channel = 'stable' AND is_active = true;
