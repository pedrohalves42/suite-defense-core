
-- Sprint 23: EDR Telemetry Tables

-- 1. Process Events (start/stop/inject)
CREATE TABLE public.endpoint_process_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  event_type text NOT NULL DEFAULT 'process_start', -- process_start, process_stop, process_inject
  pid integer NOT NULL,
  parent_pid integer,
  process_name text NOT NULL,
  command_line text,
  executable_path text,
  user_name text,
  sha256_hash text,
  parent_process_name text,
  parent_command_line text,
  mitre_technique_id text, -- e.g. T1059
  mitre_tactic text, -- e.g. Execution
  is_suspicious boolean DEFAULT false,
  detection_tags text[] DEFAULT '{}',
  event_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 2. File Events (create/modify/delete/rename)
CREATE TABLE public.endpoint_file_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  event_type text NOT NULL DEFAULT 'file_create', -- file_create, file_modify, file_delete, file_rename
  file_path text NOT NULL,
  file_name text,
  file_extension text,
  file_size bigint,
  sha256_hash text,
  old_path text, -- for renames
  process_name text, -- process that caused the event
  process_pid integer,
  is_suspicious boolean DEFAULT false,
  detection_tags text[] DEFAULT '{}',
  event_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 3. Network Events (connections)
CREATE TABLE public.endpoint_network_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  event_type text NOT NULL DEFAULT 'connection', -- connection, listen, dns_query
  protocol text DEFAULT 'tcp', -- tcp, udp, icmp
  local_address text,
  local_port integer,
  remote_address text,
  remote_port integer,
  direction text DEFAULT 'outbound', -- inbound, outbound
  process_name text,
  process_pid integer,
  bytes_sent bigint DEFAULT 0,
  bytes_received bigint DEFAULT 0,
  domain text, -- resolved domain if DNS
  dns_query_type text, -- A, AAAA, MX, TXT
  dns_response text,
  is_suspicious boolean DEFAULT false,
  detection_tags text[] DEFAULT '{}',
  geo_country text,
  event_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 4. Registry Events (Windows)
CREATE TABLE public.endpoint_registry_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  event_type text NOT NULL DEFAULT 'registry_set', -- registry_set, registry_create, registry_delete
  key_path text NOT NULL,
  value_name text,
  value_data text,
  value_type text, -- REG_SZ, REG_DWORD, etc.
  old_value_data text,
  process_name text,
  process_pid integer,
  is_suspicious boolean DEFAULT false,
  detection_tags text[] DEFAULT '{}',
  mitre_technique_id text,
  event_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- 5. Detection Events (unified detections from local engine)
CREATE TABLE public.endpoint_detection_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  agent_id uuid NOT NULL REFERENCES public.agents(id),
  detection_name text NOT NULL,
  severity text NOT NULL DEFAULT 'medium', -- low, medium, high, critical
  confidence_score integer DEFAULT 50, -- 0-100
  mitre_technique_id text,
  mitre_tactic text,
  mitre_technique_name text,
  description text,
  source_event_type text, -- process, file, network, registry
  source_event_data jsonb DEFAULT '{}',
  process_name text,
  process_pid integer,
  command_line text,
  file_path text,
  remote_address text,
  status text NOT NULL DEFAULT 'open', -- open, investigating, resolved, false_positive
  acknowledged_at timestamptz,
  acknowledged_by uuid,
  resolved_at timestamptz,
  event_time timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- ── Indexes ──

CREATE INDEX idx_proc_events_tenant_agent ON public.endpoint_process_events(tenant_id, agent_id, event_time DESC);
CREATE INDEX idx_proc_events_suspicious ON public.endpoint_process_events(tenant_id, event_time DESC) WHERE is_suspicious = true;
CREATE INDEX idx_proc_events_mitre ON public.endpoint_process_events(tenant_id, mitre_technique_id) WHERE mitre_technique_id IS NOT NULL;

CREATE INDEX idx_file_events_tenant_agent ON public.endpoint_file_events(tenant_id, agent_id, event_time DESC);
CREATE INDEX idx_file_events_suspicious ON public.endpoint_file_events(tenant_id, event_time DESC) WHERE is_suspicious = true;

CREATE INDEX idx_net_events_tenant_agent ON public.endpoint_network_events(tenant_id, agent_id, event_time DESC);
CREATE INDEX idx_net_events_suspicious ON public.endpoint_network_events(tenant_id, event_time DESC) WHERE is_suspicious = true;
CREATE INDEX idx_net_events_remote ON public.endpoint_network_events(tenant_id, remote_address) WHERE remote_address IS NOT NULL;

CREATE INDEX idx_reg_events_tenant_agent ON public.endpoint_registry_events(tenant_id, agent_id, event_time DESC);
CREATE INDEX idx_reg_events_suspicious ON public.endpoint_registry_events(tenant_id, event_time DESC) WHERE is_suspicious = true;

CREATE INDEX idx_detection_events_tenant ON public.endpoint_detection_events(tenant_id, event_time DESC);
CREATE INDEX idx_detection_events_severity ON public.endpoint_detection_events(tenant_id, severity, status) WHERE status = 'open';
CREATE INDEX idx_detection_events_mitre ON public.endpoint_detection_events(tenant_id, mitre_technique_id) WHERE mitre_technique_id IS NOT NULL;
CREATE INDEX idx_detection_events_agent ON public.endpoint_detection_events(agent_id, event_time DESC);

-- ── RLS ──

ALTER TABLE public.endpoint_process_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_file_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_network_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_registry_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.endpoint_detection_events ENABLE ROW LEVEL SECURITY;

-- Service role full access (agent ingestion)
CREATE POLICY "service_role_full_access" ON public.endpoint_process_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.endpoint_file_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.endpoint_network_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.endpoint_registry_events FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "service_role_full_access" ON public.endpoint_detection_events FOR ALL TO service_role USING (true) WITH CHECK (true);

-- Authenticated users can read their tenant's data
CREATE POLICY "tenant_read" ON public.endpoint_process_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));
CREATE POLICY "tenant_read" ON public.endpoint_file_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));
CREATE POLICY "tenant_read" ON public.endpoint_network_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));
CREATE POLICY "tenant_read" ON public.endpoint_registry_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));
CREATE POLICY "tenant_read" ON public.endpoint_detection_events FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid()));

-- Enable realtime for detection events
ALTER PUBLICATION supabase_realtime ADD TABLE public.endpoint_detection_events;
