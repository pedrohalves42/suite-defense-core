
-- P0: CyberShield Threat Network - Add cybershield_network as valid source
ALTER TYPE public.threat_feed_source ADD VALUE IF NOT EXISTS 'cybershield_network';

-- P0: Table to track cross-tenant IoC reputation (how many tenants reported same IoC)
CREATE TABLE IF NOT EXISTS public.threat_network_reputation (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  indicator_type text NOT NULL,
  indicator_value text NOT NULL,
  reporting_tenants_count int NOT NULL DEFAULT 1,
  first_reported_at timestamptz NOT NULL DEFAULT now(),
  last_reported_at timestamptz NOT NULL DEFAULT now(),
  confidence_score int NOT NULL DEFAULT 50,
  severity text NOT NULL DEFAULT 'medium',
  source_context jsonb DEFAULT '{}'::jsonb,
  is_active boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(indicator_type, indicator_value)
);

-- Index for fast lookups
CREATE INDEX IF NOT EXISTS idx_threat_network_reputation_lookup 
  ON public.threat_network_reputation(indicator_type, indicator_value) WHERE is_active = true;

-- P1: Process Lineage table for EDR visibility
CREATE TABLE IF NOT EXISTS public.agent_process_lineage (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  process_name text NOT NULL,
  process_id int NOT NULL,
  parent_process_id int,
  parent_process_name text,
  command_line text,
  user_name text,
  start_time timestamptz,
  path text,
  hash_sha256 text,
  is_suspicious boolean DEFAULT false,
  suspicion_reasons text[],
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for process lineage
CREATE INDEX IF NOT EXISTS idx_process_lineage_agent ON public.agent_process_lineage(agent_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_lineage_tenant ON public.agent_process_lineage(tenant_id, collected_at DESC);
CREATE INDEX IF NOT EXISTS idx_process_lineage_suspicious ON public.agent_process_lineage(tenant_id) WHERE is_suspicious = true;

-- RLS for process lineage
ALTER TABLE public.agent_process_lineage ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_process_lineage_select" ON public.agent_process_lineage
  FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "service_process_lineage_all" ON public.agent_process_lineage
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- RLS for threat_network_reputation (read-only for authenticated, write for service_role)
ALTER TABLE public.threat_network_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "authenticated_threat_reputation_select" ON public.threat_network_reputation
  FOR SELECT TO authenticated
  USING (true);

CREATE POLICY "service_threat_reputation_all" ON public.threat_network_reputation
  FOR ALL TO service_role
  USING (true) WITH CHECK (true);

-- Auto-cleanup: partition old process lineage data (keep 30 days)
-- This will be handled by the maintenance cron
