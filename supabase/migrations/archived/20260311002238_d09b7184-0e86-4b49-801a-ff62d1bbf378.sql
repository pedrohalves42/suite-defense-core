
-- =============================================
-- UNICORN FEATURES: All missing tables
-- =============================================

-- 1. Attack Simulations
CREATE TABLE IF NOT EXISTS public.attack_simulations (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  simulation_type text NOT NULL CHECK (simulation_type IN ('eicar_test', 'port_scan_test', 'canary_file_test', 'usb_policy_test', 'firewall_test', 'dns_filter_test')),
  title text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'running', 'completed', 'failed', 'cancelled')),
  target_agent_ids uuid[] DEFAULT '{}',
  config jsonb DEFAULT '{}',
  results_summary jsonb DEFAULT '{}',
  total_agents int DEFAULT 0,
  detected_count int DEFAULT 0,
  missed_count int DEFAULT 0,
  detection_rate numeric(5,2) DEFAULT 0,
  created_by uuid,
  started_at timestamptz,
  completed_at timestamptz,
  created_at timestamptz DEFAULT now()
);

CREATE TABLE IF NOT EXISTS public.attack_simulation_results (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  simulation_id uuid NOT NULL REFERENCES public.attack_simulations(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id uuid NOT NULL,
  agent_hostname text,
  detected boolean DEFAULT false,
  detection_time_ms int,
  detection_method text,
  details jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.attack_simulations ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.attack_simulation_results ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_attack_simulations" ON public.attack_simulations
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_attack_simulation_results" ON public.attack_simulation_results
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- 2. Shadow IT
CREATE TABLE IF NOT EXISTS public.shadow_it_catalog (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_name text NOT NULL,
  app_category text DEFAULT 'unknown' CHECK (app_category IN ('saas', 'desktop', 'browser_extension', 'cloud_storage', 'communication', 'development', 'vpn', 'remote_access', 'ai_tool', 'unknown')),
  risk_level text DEFAULT 'unknown' CHECK (risk_level IN ('approved', 'review', 'blocked', 'unknown')),
  risk_score int DEFAULT 50 CHECK (risk_score >= 0 AND risk_score <= 100),
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  agents_count int DEFAULT 1,
  agent_ids uuid[] DEFAULT '{}',
  data_sensitivity text DEFAULT 'unknown',
  ai_classification jsonb DEFAULT '{}',
  source text DEFAULT 'auto_discovery',
  created_at timestamptz DEFAULT now(),
  updated_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, app_name)
);

CREATE TABLE IF NOT EXISTS public.shadow_it_policies (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  app_pattern text NOT NULL,
  action text NOT NULL DEFAULT 'alert' CHECK (action IN ('allow', 'alert', 'block')),
  reason text,
  created_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.shadow_it_catalog ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.shadow_it_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_shadow_it_catalog" ON public.shadow_it_catalog
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_shadow_it_policies" ON public.shadow_it_policies
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- 3. Identity Security / Credential Leaks
CREATE TABLE IF NOT EXISTS public.credential_monitors (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email_domain text NOT NULL,
  monitored_emails text[] DEFAULT '{}',
  monitoring_enabled boolean DEFAULT true,
  last_check_at timestamptz,
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, email_domain)
);

CREATE TABLE IF NOT EXISTS public.credential_leaks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  email text NOT NULL,
  breach_name text,
  breach_source text,
  breach_date timestamptz,
  data_types_exposed text[] DEFAULT '{}',
  severity text DEFAULT 'medium' CHECK (severity IN ('low', 'medium', 'high', 'critical')),
  status text DEFAULT 'new' CHECK (status IN ('new', 'notified', 'resolved', 'false_positive')),
  detected_at timestamptz DEFAULT now(),
  resolved_at timestamptz,
  resolved_by uuid,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.credential_monitors ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.credential_leaks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_credential_monitors" ON public.credential_monitors
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_credential_leaks" ON public.credential_leaks
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- 4. Security Graph
CREATE TABLE IF NOT EXISTS public.security_graph_nodes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  node_type text NOT NULL CHECK (node_type IN ('process', 'ip', 'domain', 'hash', 'user', 'agent', 'file', 'cve')),
  node_value text NOT NULL,
  label text,
  metadata jsonb DEFAULT '{}',
  risk_score int DEFAULT 0,
  first_seen_at timestamptz DEFAULT now(),
  last_seen_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  UNIQUE(tenant_id, node_type, node_value)
);

CREATE TABLE IF NOT EXISTS public.security_graph_edges (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  source_node_id uuid NOT NULL REFERENCES public.security_graph_nodes(id) ON DELETE CASCADE,
  target_node_id uuid NOT NULL REFERENCES public.security_graph_nodes(id) ON DELETE CASCADE,
  relationship text NOT NULL CHECK (relationship IN ('connects_to', 'spawned_by', 'downloaded_from', 'logged_in_as', 'has_hash', 'resolved_to', 'exploits', 'installed_on', 'accessed')),
  confidence numeric(3,2) DEFAULT 0.5,
  metadata jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.security_graph_nodes ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.security_graph_edges ENABLE ROW LEVEL SECURITY;

CREATE POLICY "tenant_isolation_security_graph_nodes" ON public.security_graph_nodes
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

CREATE POLICY "tenant_isolation_security_graph_edges" ON public.security_graph_edges
  FOR ALL TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- 5. Compliance Benchmarks
CREATE TABLE IF NOT EXISTS public.compliance_benchmarks (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  industry_segment text NOT NULL DEFAULT 'all',
  period_month text NOT NULL,
  avg_score numeric(5,2) DEFAULT 0,
  median_score numeric(5,2) DEFAULT 0,
  min_score numeric(5,2) DEFAULT 0,
  max_score numeric(5,2) DEFAULT 0,
  tenant_count int DEFAULT 0,
  category_averages jsonb DEFAULT '{}',
  created_at timestamptz DEFAULT now(),
  UNIQUE(industry_segment, period_month)
);

-- Benchmarks are global/read-only for tenants
ALTER TABLE public.compliance_benchmarks ENABLE ROW LEVEL SECURITY;

CREATE POLICY "benchmarks_readable_by_authenticated" ON public.compliance_benchmarks
  FOR SELECT TO authenticated USING (true);

-- Add industry_segment to tenants if not exists
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM information_schema.columns WHERE table_name = 'tenants' AND column_name = 'industry_segment') THEN
    ALTER TABLE public.tenants ADD COLUMN industry_segment text DEFAULT 'general';
  END IF;
END $$;

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_attack_simulations_tenant ON public.attack_simulations(tenant_id);
CREATE INDEX IF NOT EXISTS idx_shadow_it_catalog_tenant ON public.shadow_it_catalog(tenant_id);
CREATE INDEX IF NOT EXISTS idx_credential_leaks_tenant ON public.credential_leaks(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_graph_nodes_tenant ON public.security_graph_nodes(tenant_id, node_type);
CREATE INDEX IF NOT EXISTS idx_security_graph_edges_source ON public.security_graph_edges(source_node_id);
CREATE INDEX IF NOT EXISTS idx_security_graph_edges_target ON public.security_graph_edges(target_node_id);
