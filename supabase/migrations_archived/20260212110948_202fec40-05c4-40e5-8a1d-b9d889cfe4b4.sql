
-- ============================================================
-- Infrastructure Layer: update_packages & agent_updates tables
-- These tables back the hexagonal architecture output ports
-- ============================================================

-- 1. update_packages: stores versioned script packages
CREATE TABLE IF NOT EXISTS public.update_packages (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  version TEXT NOT NULL,
  platform TEXT NOT NULL DEFAULT 'windows',
  channel TEXT NOT NULL DEFAULT 'stable',
  checksum TEXT NOT NULL,
  script_content TEXT NOT NULL,
  size INTEGER NOT NULL,
  release_notes TEXT NOT NULL DEFAULT '',
  is_active BOOLEAN NOT NULL DEFAULT true,
  signature_base64 TEXT,
  signed_at TIMESTAMPTZ,
  signed_by TEXT,
  min_version TEXT,
  max_version TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- 2. agent_updates: tracks update lifecycle per agent
CREATE TABLE IF NOT EXISTS public.agent_updates (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id UUID NOT NULL,
  package_id UUID NOT NULL REFERENCES public.update_packages(id),
  status TEXT NOT NULL DEFAULT 'pending',
  download_started_at TIMESTAMPTZ,
  download_completed_at TIMESTAMPTZ,
  apply_started_at TIMESTAMPTZ,
  apply_completed_at TIMESTAMPTZ,
  error_message TEXT,
  rollback_reason TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes for common queries
CREATE INDEX IF NOT EXISTS idx_update_packages_active ON public.update_packages (platform, channel, is_active) WHERE is_active = true;
CREATE INDEX IF NOT EXISTS idx_agent_updates_agent_status ON public.agent_updates (agent_id, status);
CREATE INDEX IF NOT EXISTS idx_agent_updates_package ON public.agent_updates (package_id);

-- Enable RLS
ALTER TABLE public.update_packages ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.agent_updates ENABLE ROW LEVEL SECURITY;

-- RLS policies for update_packages (read by authenticated, write by admin)
CREATE POLICY "Authenticated users can read active packages"
  ON public.update_packages FOR SELECT TO authenticated
  USING (is_active = true);

CREATE POLICY "Admins can manage packages"
  ON public.update_packages FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- RLS policies for agent_updates (tenant-scoped via agent ownership)
CREATE POLICY "Authenticated users can read own agent updates"
  ON public.agent_updates FOR SELECT TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      JOIN public.user_roles ur ON ur.user_id = auth.uid()
      WHERE a.id = agent_updates.agent_id
        AND a.tenant_id = (auth.jwt() ->> 'active_tenant_id')::uuid
    )
  );

CREATE POLICY "Admins can manage agent updates"
  ON public.agent_updates FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Service role policy for edge functions (backend operations)
CREATE POLICY "Service role full access to update_packages"
  ON public.update_packages FOR ALL TO service_role
  USING (true) WITH CHECK (true);

CREATE POLICY "Service role full access to agent_updates"
  ON public.agent_updates FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Trigger for updated_at on agent_updates
CREATE TRIGGER update_agent_updates_updated_at
  BEFORE UPDATE ON public.agent_updates
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at_column();
