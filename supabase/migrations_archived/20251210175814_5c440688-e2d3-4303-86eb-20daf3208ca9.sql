-- Create CVE Database table for caching NVD CVE data
CREATE TABLE IF NOT EXISTS public.cve_database (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  cve_id TEXT UNIQUE NOT NULL,
  description TEXT,
  cvss_score NUMERIC(4,2),
  cvss_version TEXT DEFAULT '3.1',
  cvss_vector TEXT,
  severity TEXT,
  affected_products JSONB DEFAULT '[]'::jsonb,
  affected_versions JSONB DEFAULT '[]'::jsonb,
  cpe_matches JSONB DEFAULT '[]'::jsonb,
  published_date TIMESTAMPTZ,
  last_modified TIMESTAMPTZ,
  cve_references JSONB DEFAULT '[]'::jsonb,
  weaknesses JSONB DEFAULT '[]'::jsonb,
  cached_at TIMESTAMPTZ DEFAULT NOW(),
  source TEXT DEFAULT 'nvd',
  is_active BOOLEAN DEFAULT true,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Create indexes for efficient lookups
CREATE INDEX IF NOT EXISTS idx_cve_database_cve_id ON public.cve_database(cve_id);
CREATE INDEX IF NOT EXISTS idx_cve_database_severity ON public.cve_database(severity);
CREATE INDEX IF NOT EXISTS idx_cve_database_cvss_score ON public.cve_database(cvss_score DESC);
CREATE INDEX IF NOT EXISTS idx_cve_database_published_date ON public.cve_database(published_date DESC);
CREATE INDEX IF NOT EXISTS idx_cve_database_cached_at ON public.cve_database(cached_at);
CREATE INDEX IF NOT EXISTS idx_cve_database_cpe_matches ON public.cve_database USING GIN(cpe_matches);
CREATE INDEX IF NOT EXISTS idx_cve_database_affected_products ON public.cve_database USING GIN(affected_products);

-- Enable RLS
ALTER TABLE public.cve_database ENABLE ROW LEVEL SECURITY;

-- CVE database is read-only for authenticated users (public security data)
CREATE POLICY "Authenticated users can view CVE database"
  ON public.cve_database FOR SELECT
  USING (auth.role() = 'authenticated' OR auth.role() = 'anon');

-- Only service role can insert/update CVEs
CREATE POLICY "Service role can manage CVE database"
  ON public.cve_database FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Create table to track NVD API sync status
CREATE TABLE IF NOT EXISTS public.cve_sync_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  last_sync_at TIMESTAMPTZ,
  last_modified_date TIMESTAMPTZ,
  total_cves_synced INTEGER DEFAULT 0,
  sync_status TEXT DEFAULT 'idle',
  error_message TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- Insert initial sync status
INSERT INTO public.cve_sync_status (last_sync_at, sync_status)
VALUES (NULL, 'pending')
ON CONFLICT DO NOTHING;

-- Enable RLS
ALTER TABLE public.cve_sync_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view sync status"
  ON public.cve_sync_status FOR SELECT
  USING (auth.role() = 'authenticated');

CREATE POLICY "Service role can manage sync status"
  ON public.cve_sync_status FOR ALL
  USING (auth.jwt() ->> 'role' = 'service_role')
  WITH CHECK (auth.jwt() ->> 'role' = 'service_role');

-- Add comment for documentation
COMMENT ON TABLE public.cve_database IS 'Cache of CVE data from NVD API for vulnerability scanning';
COMMENT ON TABLE public.cve_sync_status IS 'Tracks NVD API synchronization status and progress';