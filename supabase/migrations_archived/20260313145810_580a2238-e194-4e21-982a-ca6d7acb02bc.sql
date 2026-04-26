
-- Sprint 25: Correlation Engine

-- Correlated incidents (multi-signal grouping)
CREATE TABLE public.correlated_incidents (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  title text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',
  confidence_score integer NOT NULL DEFAULT 50,
  status text NOT NULL DEFAULT 'open', -- open, investigating, resolved, false_positive
  mitre_tactics text[] DEFAULT '{}',
  mitre_techniques text[] DEFAULT '{}',
  affected_agents uuid[] DEFAULT '{}',
  event_count integer NOT NULL DEFAULT 0,
  first_event_time timestamptz NOT NULL,
  last_event_time timestamptz NOT NULL,
  correlation_rule text, -- which correlation pattern triggered this
  assigned_to uuid,
  resolved_at timestamptz,
  resolved_by uuid,
  resolution_notes text,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Events linked to an incident
CREATE TABLE public.correlated_incident_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  incident_id uuid NOT NULL REFERENCES public.correlated_incidents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  detection_event_id uuid REFERENCES public.endpoint_detection_events(id),
  event_type text NOT NULL, -- process, file, network, registry, detection
  event_summary text NOT NULL,
  event_time timestamptz NOT NULL,
  agent_id uuid NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  event_data jsonb DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Correlation rules (configurable patterns)
CREATE TABLE public.correlation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id), -- NULL = global
  rule_name text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'high',
  time_window_minutes integer NOT NULL DEFAULT 30,
  min_events integer NOT NULL DEFAULT 2,
  event_patterns jsonb NOT NULL DEFAULT '[]', -- array of {event_type, field_match}
  is_enabled boolean NOT NULL DEFAULT true,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX idx_correlated_incidents_tenant ON public.correlated_incidents(tenant_id, status, created_at DESC);
CREATE INDEX idx_correlated_incidents_open ON public.correlated_incidents(tenant_id, severity) WHERE status = 'open';
CREATE INDEX idx_incident_events_incident ON public.correlated_incident_events(incident_id);
CREATE INDEX idx_incident_events_agent ON public.correlated_incident_events(agent_id, event_time DESC);

-- RLS
ALTER TABLE public.correlated_incidents ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correlated_incident_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.correlation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full" ON public.correlated_incidents FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_read" ON public.correlated_incidents FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));
CREATE POLICY "tenant_update" ON public.correlated_incidents FOR UPDATE TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "service_role_full" ON public.correlated_incident_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_read" ON public.correlated_incident_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "service_role_full" ON public.correlation_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_read" ON public.correlation_rules FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Enable realtime for incidents
ALTER PUBLICATION supabase_realtime ADD TABLE public.correlated_incidents;

-- Seed default correlation rules
INSERT INTO public.correlation_rules (tenant_id, rule_name, description, severity, time_window_minutes, min_events, event_patterns) VALUES
  (NULL, 'Attack Chain: Execution + C2', 'PowerShell or LOLBin execution followed by suspicious outbound connection', 'critical', 30, 2,
   '[{"event_type":"process","mitre_tactic":"Execution"},{"event_type":"network","mitre_tactic":"Command and Control"}]'::jsonb),
  (NULL, 'Attack Chain: Credential Access + Lateral', 'Credential dumping followed by lateral movement indicators', 'critical', 60, 2,
   '[{"event_type":"process","mitre_tactic":"Credential Access"},{"event_type":"process","mitre_tactic":"Lateral Movement"}]'::jsonb),
  (NULL, 'Persistence + Defense Evasion', 'Registry persistence followed by defense evasion activity', 'high', 45, 2,
   '[{"event_type":"registry","mitre_tactic":"Persistence"},{"event_type":"process","mitre_tactic":"Defense Evasion"}]'::jsonb),
  (NULL, 'Ransomware Pattern', 'Mass file operations with encryption indicators', 'critical', 15, 3,
   '[{"event_type":"file","mitre_technique_id":"T1486"},{"event_type":"process","mitre_tactic":"Execution"},{"event_type":"file","event_type_match":"file_rename"}]'::jsonb),
  (NULL, 'Multi-Stage Attack', 'Three or more different MITRE tactics from same agent within window', 'critical', 60, 3,
   '[{"event_type":"any","distinct_tactics":3}]'::jsonb);
