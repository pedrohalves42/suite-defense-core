-- Create a storage bucket for agent scripts
INSERT INTO storage.buckets (id, name, public)
VALUES ('agent-scripts', 'agent-scripts', true)
ON CONFLICT (id) DO NOTHING;

-- Allow public read access
CREATE POLICY "Public read agent scripts"
ON storage.objects FOR SELECT
USING (bucket_id = 'agent-scripts');

-- Allow service role to upload
CREATE POLICY "Service role can upload agent scripts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'agent-scripts');