-- AUDIT-FIX: Proteger view agent_releases_public com security_invoker
-- Remove script_content e adiciona tenant filtering

DROP VIEW IF EXISTS public.agent_releases_public;

CREATE VIEW public.agent_releases_public
WITH (security_invoker = on)
AS
SELECT 
  id,
  version,
  platform,
  channel,
  sha256,
  release_notes,
  is_active,
  created_at
FROM public.agent_releases
WHERE is_active = true;