
-- Remove duplicate public read policy for agent-scripts bucket
-- "Agent scripts are publicly readable" already covers this
DROP POLICY IF EXISTS "Public read agent scripts" ON storage.objects;
