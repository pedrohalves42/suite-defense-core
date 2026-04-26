-- Add integrity columns to generated_reports
ALTER TABLE public.generated_reports 
ADD COLUMN IF NOT EXISTS sha256 text,
ADD COLUMN IF NOT EXISTS hmac_signature text,
ADD COLUMN IF NOT EXISTS audit_id text UNIQUE,
ADD COLUMN IF NOT EXISTS verified_at timestamptz,
ADD COLUMN IF NOT EXISTS verified_by uuid REFERENCES auth.users(id);

-- Add report_data column if not exists (for storing full payload)
ALTER TABLE public.generated_reports 
ADD COLUMN IF NOT EXISTS report_data jsonb;

-- Create indexes for fast lookups
CREATE INDEX IF NOT EXISTS idx_generated_reports_audit_id ON public.generated_reports(audit_id);
CREATE INDEX IF NOT EXISTS idx_generated_reports_sha256 ON public.generated_reports(sha256);

-- Create audit_report_verifications table for verification trail
CREATE TABLE IF NOT EXISTS public.audit_report_verifications (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  report_id uuid REFERENCES public.generated_reports(id) ON DELETE CASCADE,
  audit_id text NOT NULL,
  verified_at timestamptz DEFAULT now(),
  verified_by uuid REFERENCES auth.users(id),
  verification_ip text,
  sha256_match boolean NOT NULL,
  hmac_valid boolean NOT NULL,
  verification_method text DEFAULT 'web',
  verification_details jsonb DEFAULT '{}'::jsonb,
  created_at timestamptz DEFAULT now()
);

-- Create index for verification lookups
CREATE INDEX IF NOT EXISTS idx_audit_report_verifications_audit_id ON public.audit_report_verifications(audit_id);
CREATE INDEX IF NOT EXISTS idx_audit_report_verifications_report_id ON public.audit_report_verifications(report_id);

-- Enable RLS for audit_report_verifications
ALTER TABLE public.audit_report_verifications ENABLE ROW LEVEL SECURITY;

-- RLS Policy: Allow public INSERT for verification logging (anyone can verify a report)
CREATE POLICY "Allow public verification inserts"
ON public.audit_report_verifications
FOR INSERT
TO public
WITH CHECK (true);

-- RLS Policy: Allow service role to read all verifications
CREATE POLICY "Allow service role to read verifications"
ON public.audit_report_verifications
FOR SELECT
TO service_role
USING (true);

-- RLS Policy: Allow authenticated users to read their tenant's verifications
CREATE POLICY "Allow authenticated users to read verifications"
ON public.audit_report_verifications
FOR SELECT
TO authenticated
USING (
  report_id IN (
    SELECT id FROM public.generated_reports gr
    WHERE gr.tenant_id IN (
      SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()
    )
  )
);

-- Comment for documentation
COMMENT ON TABLE public.audit_report_verifications IS 'Audit trail for compliance report verifications (SOC2/ISO 27001)';
COMMENT ON COLUMN public.audit_report_verifications.sha256_match IS 'Whether the SHA256 hash matched during verification';
COMMENT ON COLUMN public.audit_report_verifications.hmac_valid IS 'Whether the HMAC signature was valid during verification';