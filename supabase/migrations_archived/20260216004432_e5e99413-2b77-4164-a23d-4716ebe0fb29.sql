
-- Create storage bucket for agent scripts
INSERT INTO storage.buckets (id, name, public) 
VALUES ('agent-scripts', 'agent-scripts', true)
ON CONFLICT (id) DO NOTHING;

-- Public read policy
CREATE POLICY "Agent scripts are publicly readable"
ON storage.objects FOR SELECT
USING (bucket_id = 'agent-scripts');

-- Only authenticated users can upload
CREATE POLICY "Only admins can upload agent scripts"
ON storage.objects FOR INSERT
WITH CHECK (bucket_id = 'agent-scripts' AND auth.role() = 'authenticated');
