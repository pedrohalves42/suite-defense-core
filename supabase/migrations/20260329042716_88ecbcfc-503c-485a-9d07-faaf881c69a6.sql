
-- Create the v_virus_scans view with actual columns
CREATE OR REPLACE VIEW public.v_virus_scans AS
SELECT id, agent_name, tenant_id, file_path, file_hash, scan_result, is_malicious, positives, total_scans, scanned_at, virustotal_permalink
FROM public.virus_scans;

-- Grant access
GRANT SELECT ON public.v_virus_scans TO authenticated;
GRANT SELECT ON public.v_virus_scans TO anon;

-- Add tenant_id to rate_limits if missing
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM information_schema.columns
    WHERE table_schema = 'public' AND table_name = 'rate_limits' AND column_name = 'tenant_id'
  ) THEN
    ALTER TABLE public.rate_limits ADD COLUMN tenant_id text;
  END IF;
END $$;
