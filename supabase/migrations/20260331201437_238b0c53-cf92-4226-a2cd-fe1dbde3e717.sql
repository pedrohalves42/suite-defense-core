
-- Fix BLOCKER: Storage policy "Service role can upload agent scripts" applied to {public} role
-- This allows ANONYMOUS uploads to agent-scripts bucket — critical supply chain vulnerability
-- Correction: restrict to service_role only

DROP POLICY IF EXISTS "Service role can upload agent scripts" ON storage.objects;

CREATE POLICY "service_role_upload_agent_scripts"
ON storage.objects
FOR INSERT
TO service_role
WITH CHECK (bucket_id = 'agent-scripts');
