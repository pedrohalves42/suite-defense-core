-- P0 CRITICAL FIX: Secure agent_releases_public view
-- Issue: View exposes agent versions, SHA256 hashes to anonymous users
-- Fix: Require authentication to access release information

DROP VIEW IF EXISTS public.agent_releases_public;

CREATE VIEW public.agent_releases_public
WITH (security_invoker=on) AS
SELECT 
  id, 
  version, 
  platform, 
  channel, 
  sha256, 
  release_notes, 
  is_active, 
  created_at
FROM agent_releases
WHERE is_active = true
  AND EXISTS (SELECT 1 FROM user_roles WHERE user_id = auth.uid());