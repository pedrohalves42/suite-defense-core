
-- Secret rotation audit log for SOC 2 compliance
CREATE TABLE public.secret_rotation_log (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  secret_name TEXT NOT NULL,
  rotated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  rotated_by TEXT NOT NULL DEFAULT 'system',
  rotation_method TEXT NOT NULL DEFAULT 'manual',
  previous_key_prefix TEXT,
  new_key_prefix TEXT,
  overlap_expires_at TIMESTAMPTZ,
  status TEXT NOT NULL DEFAULT 'completed',
  notes TEXT,
  tenant_id UUID REFERENCES public.tenants(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

ALTER TABLE public.secret_rotation_log ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Only service role can manage secret_rotation_log"
  ON public.secret_rotation_log FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

REVOKE ALL ON public.secret_rotation_log FROM anon;
REVOKE ALL ON public.secret_rotation_log FROM authenticated;
GRANT ALL ON public.secret_rotation_log TO service_role;

CREATE INDEX idx_secret_rotation_name ON public.secret_rotation_log (secret_name);
CREATE INDEX idx_secret_rotation_date ON public.secret_rotation_log (rotated_at DESC);
