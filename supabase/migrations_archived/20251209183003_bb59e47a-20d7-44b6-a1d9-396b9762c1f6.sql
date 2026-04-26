-- Make agent-installers bucket private to prevent unauthorized downloads
UPDATE storage.buckets
SET public = false
WHERE id = 'agent-installers';

-- Update storage policy: Remove public read, require authentication for downloads
DROP POLICY IF EXISTS "agent_installers_public_read" ON storage.objects;

-- Create new authenticated-only read policy
CREATE POLICY "agent_installers_authenticated_read"
ON storage.objects
FOR SELECT
USING (
  bucket_id = 'agent-installers' 
  AND auth.role() = 'authenticated'
);

-- Note: Uploads still restricted to admins via existing policy
-- Note: Edge Functions using service_role key bypass RLS and can still access