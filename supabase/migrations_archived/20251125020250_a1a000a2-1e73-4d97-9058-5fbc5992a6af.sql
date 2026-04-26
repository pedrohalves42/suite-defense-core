-- Migration: Security Features + Web Activity
-- Version: v3.10.0-SECURITY-FEATURES
-- Description: Add 12 new tables for security monitoring and web activity tracking

-- 1) Feature flags por tenant
CREATE TABLE IF NOT EXISTS public.feature_flags (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  key TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT false,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, key)
);

CREATE INDEX IF NOT EXISTS idx_feature_flags_tenant ON public.feature_flags(tenant_id);

ALTER TABLE public.feature_flags ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage feature flags in their tenant"
  ON public.feature_flags
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = feature_flags.tenant_id
        AND role = 'admin'
    )
  );

-- 2) Inventario de software
CREATE TABLE IF NOT EXISTS public.software_inventory (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  version TEXT,
  vendor TEXT,
  install_location TEXT,
  risk_level TEXT CHECK (risk_level IN ('unknown', 'low', 'medium', 'high', 'critical')) DEFAULT 'unknown',
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (agent_id, name, version)
);

CREATE INDEX IF NOT EXISTS idx_software_inventory_agent ON public.software_inventory(agent_id);
CREATE INDEX IF NOT EXISTS idx_software_inventory_tenant ON public.software_inventory(tenant_id);
CREATE INDEX IF NOT EXISTS idx_software_inventory_risk ON public.software_inventory(risk_level);

ALTER TABLE public.software_inventory ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can view software inventory in their tenant"
  ON public.software_inventory
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'operator', 'viewer')
    )
  );

-- 3) Reputacao de URLs
CREATE TABLE IF NOT EXISTS public.url_reputation (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  url TEXT NOT NULL,
  domain TEXT,
  reputation TEXT CHECK (reputation IN ('unknown', 'clean', 'suspicious', 'malicious')) DEFAULT 'unknown',
  score NUMERIC,
  category TEXT,
  last_checked_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  details JSONB DEFAULT '{}'::jsonb
);

CREATE INDEX IF NOT EXISTS idx_url_reputation_tenant_url ON public.url_reputation(tenant_id, url);
CREATE INDEX IF NOT EXISTS idx_url_reputation_domain ON public.url_reputation(domain);

ALTER TABLE public.url_reputation ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view URL reputation in their tenant"
  ON public.url_reputation
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

-- 4) Vulnerabilidades leves
CREATE TABLE IF NOT EXISTS public.vuln_findings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL,
  check_key TEXT NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  remediation TEXT,
  first_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  last_seen_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ,
  UNIQUE (agent_id, check_key)
);

CREATE INDEX IF NOT EXISTS idx_vuln_findings_agent ON public.vuln_findings(agent_id);
CREATE INDEX IF NOT EXISTS idx_vuln_findings_tenant ON public.vuln_findings(tenant_id);
CREATE INDEX IF NOT EXISTS idx_vuln_findings_severity ON public.vuln_findings(severity);

ALTER TABLE public.vuln_findings ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view vuln findings in their tenant"
  ON public.vuln_findings
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'operator', 'viewer')
    )
  );

-- 5) Policies e regras
CREATE TABLE IF NOT EXISTS public.security_policies (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  enabled BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_policies_tenant ON public.security_policies(tenant_id);

ALTER TABLE public.security_policies ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage security policies in their tenant"
  ON public.security_policies
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = security_policies.tenant_id
        AND role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.policy_rules (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  policy_id UUID NOT NULL REFERENCES public.security_policies(id) ON DELETE CASCADE,
  rule_type TEXT NOT NULL,
  condition JSONB NOT NULL,
  action JSONB NOT NULL,
  priority INTEGER NOT NULL DEFAULT 100,
  enabled BOOLEAN NOT NULL DEFAULT true
);

CREATE INDEX IF NOT EXISTS idx_policy_rules_policy ON public.policy_rules(policy_id);

ALTER TABLE public.policy_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage policy rules via their policies"
  ON public.policy_rules
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.security_policies sp
      JOIN public.user_roles ur ON ur.tenant_id = sp.tenant_id
      WHERE sp.id = policy_rules.policy_id
        AND ur.user_id = auth.uid()
        AND ur.role = 'admin'
    )
  );

-- 6) Eventos de seguranca
CREATE TABLE IF NOT EXISTS public.security_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  policy_id UUID REFERENCES public.security_policies(id) ON DELETE SET NULL,
  rule_id UUID REFERENCES public.policy_rules(id) ON DELETE SET NULL,
  severity TEXT CHECK (severity IN ('info', 'low', 'medium', 'high', 'critical')) NOT NULL,
  title TEXT NOT NULL,
  description TEXT,
  status TEXT CHECK (status IN ('open', 'acknowledged', 'closed')) NOT NULL DEFAULT 'open',
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_security_events_tenant ON public.security_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_security_events_agent ON public.security_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_security_events_severity ON public.security_events(severity);
CREATE INDEX IF NOT EXISTS idx_security_events_status ON public.security_events(status);

ALTER TABLE public.security_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view security events in their tenant"
  ON public.security_events
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'operator', 'viewer')
    )
  );

CREATE POLICY "Admins can update security events in their tenant"
  ON public.security_events
  FOR UPDATE
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = security_events.tenant_id
        AND role = 'admin'
    )
  );

-- 7) Jobs agendados
CREATE TABLE IF NOT EXISTS public.scheduled_jobs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  job_type TEXT NOT NULL,
  payload JSONB NOT NULL DEFAULT '{}'::jsonb,
  agent_id UUID REFERENCES public.agents(id) ON DELETE CASCADE,
  agent_group_id UUID,
  cron_expr TEXT NOT NULL,
  enabled BOOLEAN NOT NULL DEFAULT true,
  last_run_at TIMESTAMPTZ,
  next_run_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_tenant ON public.scheduled_jobs(tenant_id);
CREATE INDEX IF NOT EXISTS idx_scheduled_jobs_next_run ON public.scheduled_jobs(next_run_at) WHERE enabled = true;

ALTER TABLE public.scheduled_jobs ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage scheduled jobs in their tenant"
  ON public.scheduled_jobs
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = scheduled_jobs.tenant_id
        AND role = 'admin'
    )
  );

-- 8) Grupos de agentes
CREATE TABLE IF NOT EXISTS public.agent_groups (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  name TEXT NOT NULL,
  description TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (tenant_id, name)
);

CREATE INDEX IF NOT EXISTS idx_agent_groups_tenant ON public.agent_groups(tenant_id);

ALTER TABLE public.agent_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view agent groups in their tenant"
  ON public.agent_groups
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid()
    )
  );

CREATE POLICY "Admins can manage agent groups in their tenant"
  ON public.agent_groups
  FOR ALL
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles
      WHERE user_id = auth.uid()
        AND tenant_id = agent_groups.tenant_id
        AND role = 'admin'
    )
  );

CREATE TABLE IF NOT EXISTS public.agents_groups (
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  group_id UUID NOT NULL REFERENCES public.agent_groups(id) ON DELETE CASCADE,
  PRIMARY KEY (agent_id, group_id)
);

CREATE INDEX IF NOT EXISTS idx_agents_groups_agent ON public.agents_groups(agent_id);
CREATE INDEX IF NOT EXISTS idx_agents_groups_group ON public.agents_groups(group_id);

ALTER TABLE public.agents_groups ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view agent group memberships in their tenant"
  ON public.agents_groups
  FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.agents a
      JOIN public.user_roles ur ON ur.tenant_id = a.tenant_id
      WHERE a.id = agents_groups.agent_id
        AND ur.user_id = auth.uid()
    )
  );

-- 9) Status de antivirus
CREATE TABLE IF NOT EXISTS public.antivirus_status (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  engine_name TEXT NOT NULL,
  engine_version TEXT,
  status TEXT,
  last_update_at TIMESTAMPTZ,
  last_scan_at TIMESTAMPTZ,
  threats_found INTEGER,
  raw_data JSONB DEFAULT '{}'::jsonb,
  collected_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_antivirus_status_agent ON public.antivirus_status(agent_id);
CREATE INDEX IF NOT EXISTS idx_antivirus_status_tenant ON public.antivirus_status(tenant_id);

ALTER TABLE public.antivirus_status ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view antivirus status in their tenant"
  ON public.antivirus_status
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'operator', 'viewer')
    )
  );

-- 10) Anomalias
CREATE TABLE IF NOT EXISTS public.anomaly_events (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  type TEXT NOT NULL,
  severity TEXT CHECK (severity IN ('low', 'medium', 'high', 'critical')) NOT NULL,
  description TEXT,
  data JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  acknowledged_at TIMESTAMPTZ
);

CREATE INDEX IF NOT EXISTS idx_anomaly_events_agent ON public.anomaly_events(agent_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_tenant ON public.anomaly_events(tenant_id);
CREATE INDEX IF NOT EXISTS idx_anomaly_events_severity ON public.anomaly_events(severity);

ALTER TABLE public.anomaly_events ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view anomaly events in their tenant"
  ON public.anomaly_events
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'operator', 'viewer')
    )
  );

-- 11) Atividade web por agente (sites acessados)
CREATE TABLE IF NOT EXISTS public.agent_web_activity (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  domain TEXT NOT NULL,
  url TEXT,
  source TEXT NOT NULL DEFAULT 'dns_cache',
  visited_at TIMESTAMPTZ NOT NULL,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_agent_web_activity_agent_time ON public.agent_web_activity(agent_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_tenant_time ON public.agent_web_activity(tenant_id, visited_at DESC);
CREATE INDEX IF NOT EXISTS idx_agent_web_activity_domain ON public.agent_web_activity(domain);

ALTER TABLE public.agent_web_activity ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view web activity in their tenant"
  ON public.agent_web_activity
  FOR SELECT
  USING (
    tenant_id IN (
      SELECT tenant_id FROM public.user_roles
      WHERE user_id = auth.uid() AND role IN ('admin', 'operator', 'viewer')
    )
  );

-- 12) View de timeline por agente
CREATE OR REPLACE VIEW public.agent_timeline_events
WITH (security_invoker = on)
AS
SELECT
  j.tenant_id,
  j.agent_id,
  j.id AS source_id,
  'job'::TEXT AS event_type,
  CASE
    WHEN j.status = 'queued' THEN 'job_queued'
    WHEN j.status = 'delivered' THEN 'job_delivered'
    WHEN j.status = 'completed' THEN 'job_completed'
    WHEN j.status = 'failed' THEN 'job_failed'
    ELSE 'job_event'
  END AS event_key,
  COALESCE(j.created_at, now()) AS event_time,
  jsonb_build_object(
    'job_type', j.type,
    'status', j.status,
    'error_message', j.error_message
  ) AS data
FROM public.jobs j
WHERE j.tenant_id IN (
  SELECT tenant_id FROM public.user_roles
  WHERE user_id = auth.uid()
)

UNION ALL

SELECT
  vf.tenant_id,
  vf.agent_id,
  vf.id AS source_id,
  'vuln_finding'::TEXT AS event_type,
  'vuln_detected'::TEXT AS event_key,
  vf.first_seen_at AS event_time,
  jsonb_build_object(
    'severity', vf.severity,
    'title', vf.title,
    'check_key', vf.check_key
  ) AS data
FROM public.vuln_findings vf
WHERE vf.tenant_id IN (
  SELECT tenant_id FROM public.user_roles
  WHERE user_id = auth.uid()
)

UNION ALL

SELECT
  se.tenant_id,
  se.agent_id,
  se.id AS source_id,
  'security_event'::TEXT AS event_type,
  'policy_triggered'::TEXT AS event_key,
  se.created_at AS event_time,
  jsonb_build_object(
    'severity', se.severity,
    'title', se.title,
    'status', se.status
  ) AS data
FROM public.security_events se
WHERE se.tenant_id IN (
  SELECT tenant_id FROM public.user_roles
  WHERE user_id = auth.uid()
)

UNION ALL

SELECT
  ae.tenant_id,
  ae.agent_id,
  ae.id AS source_id,
  'anomaly'::TEXT AS event_type,
  'anomaly_detected'::TEXT AS event_key,
  ae.created_at AS event_time,
  jsonb_build_object(
    'type', ae.type,
    'severity', ae.severity
  ) AS data
FROM public.anomaly_events ae
WHERE ae.tenant_id IN (
  SELECT tenant_id FROM public.user_roles
  WHERE user_id = auth.uid()
);