
-- Dead Letter Queue table
CREATE TABLE IF NOT EXISTS public.dead_letter_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_id UUID NOT NULL,
  original_data JSONB NOT NULL,
  failure_count INTEGER NOT NULL DEFAULT 0,
  last_error TEXT,
  moved_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id),
  reprocessed_at TIMESTAMPTZ,
  reprocessed_by UUID
);

CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_tenant ON public.dead_letter_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_dead_letter_jobs_moved_at ON public.dead_letter_jobs(moved_at DESC);

ALTER TABLE public.dead_letter_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for dead_letter_jobs"
  ON public.dead_letter_jobs
  FOR ALL
  TO authenticated
  USING (
    tenant_id IN (
      SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
    )
  );

-- KV Cache table
CREATE TABLE IF NOT EXISTS public.kv_cache (
  key TEXT PRIMARY KEY,
  value JSONB NOT NULL,
  expires_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_kv_cache_expires ON public.kv_cache(expires_at);

ALTER TABLE public.kv_cache ENABLE ROW LEVEL SECURITY;

-- KV cache is used by service_role only (edge functions), no user-facing RLS needed
CREATE POLICY "Service role only for kv_cache"
  ON public.kv_cache
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Feature Flags table
CREATE TABLE IF NOT EXISTS public.feature_flags (
  name TEXT PRIMARY KEY,
  enabled BOOLEAN NOT NULL DEFAULT false,
  rollout_pct INTEGER NOT NULL DEFAULT 0 CHECK (rollout_pct >= 0 AND rollout_pct <= 100),
  tenant_id UUID REFERENCES public.tenants(id),
  metadata JSONB,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON public.feature_flags(tenant_id);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for feature_flags"
  ON public.feature_flags
  FOR SELECT
  TO authenticated
  USING (
    tenant_id IS NULL
    OR tenant_id IN (
      SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
    )
  );

CREATE POLICY "Service role manage feature_flags"
  ON public.feature_flags
  FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);
