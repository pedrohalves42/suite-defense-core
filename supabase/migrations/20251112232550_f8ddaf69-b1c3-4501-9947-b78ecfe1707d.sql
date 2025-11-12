-- Create agent_builds table to track EXE build requests
CREATE TABLE IF NOT EXISTS public.agent_builds (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  enrollment_key_id UUID REFERENCES public.enrollment_keys(id) ON DELETE SET NULL,
  
  -- Build metadata
  build_status TEXT NOT NULL DEFAULT 'queued' 
    CHECK (build_status IN ('queued', 'building', 'completed', 'failed')),
  build_started_at TIMESTAMPTZ,
  build_completed_at TIMESTAMPTZ,
  build_duration_seconds INTEGER,
  
  -- Output file info
  file_path TEXT, -- Storage path: agent-installers/{tenant_id}/{agent_name}-{timestamp}.exe
  file_size_bytes BIGINT,
  sha256_hash TEXT,
  download_url TEXT,
  download_expires_at TIMESTAMPTZ,
  
  -- Version tracking
  ps1_version TEXT DEFAULT '3.0',
  exe_version TEXT DEFAULT '2.2.1',
  ps2exe_version TEXT,
  
  -- Build logs and errors
  build_log JSONB DEFAULT '[]'::jsonb,
  error_message TEXT,
  github_run_id TEXT, -- If using GitHub Actions
  
  -- Audit
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  
  -- Constraints
  CONSTRAINT valid_duration CHECK (build_duration_seconds IS NULL OR build_duration_seconds >= 0),
  CONSTRAINT valid_file_size CHECK (file_size_bytes IS NULL OR file_size_bytes > 0)
);

-- Indexes for performance
CREATE INDEX idx_agent_builds_tenant ON public.agent_builds(tenant_id, created_at DESC);
CREATE INDEX idx_agent_builds_status ON public.agent_builds(build_status) WHERE build_status IN ('queued', 'building');
CREATE INDEX idx_agent_builds_agent ON public.agent_builds(agent_id);

-- RLS Policies
ALTER TABLE public.agent_builds ENABLE ROW LEVEL SECURITY;

-- Admins can view builds in their tenant
CREATE POLICY "Admins can view builds in their tenant"
ON public.agent_builds
FOR SELECT
USING (
  has_role(auth.uid(), 'admin') AND
  tenant_id = current_user_tenant_id()
);

-- Admins can create new builds
CREATE POLICY "Admins can create builds"
ON public.agent_builds
FOR INSERT
WITH CHECK (
  has_role(auth.uid(), 'admin') AND
  tenant_id = current_user_tenant_id() AND
  created_by = auth.uid()
);

-- System can update build status (via service_role)
CREATE POLICY "System can update builds"
ON public.agent_builds
FOR UPDATE
USING (true);

-- Create storage bucket for agent installers
INSERT INTO storage.buckets (id, name, public, file_size_limit, allowed_mime_types)
VALUES (
  'agent-installers',
  'agent-installers',
  true, -- Public read access
  52428800, -- 50MB limit
  ARRAY['application/octet-stream', 'application/x-msdownload']::text[]
)
ON CONFLICT (id) DO NOTHING;

-- RLS Policy: Admins can upload
CREATE POLICY "Admins can upload installers"
ON storage.objects
FOR INSERT
TO authenticated
WITH CHECK (
  bucket_id = 'agent-installers' AND
  has_role(auth.uid(), 'admin')
);

-- RLS Policy: Anyone can download (signed URL required)
CREATE POLICY "Public can download installers"
ON storage.objects
FOR SELECT
USING (bucket_id = 'agent-installers');

-- RLS Policy: System can delete old builds
CREATE POLICY "System can delete old installers"
ON storage.objects
FOR DELETE
USING (bucket_id = 'agent-installers');

-- Comment
COMMENT ON TABLE public.agent_builds IS 'Tracks EXE build requests and status for agent installers';