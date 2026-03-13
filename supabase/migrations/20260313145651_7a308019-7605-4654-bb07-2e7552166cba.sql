
-- Sprint 24: Detection Rules Engine + MITRE ATT&CK Mapping

-- Detection rules table (configurable per tenant)
CREATE TABLE public.detection_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES public.tenants(id), -- NULL = global rule
  rule_name text NOT NULL,
  description text,
  severity text NOT NULL DEFAULT 'medium',
  confidence_base integer NOT NULL DEFAULT 50,
  mitre_technique_id text NOT NULL,
  mitre_tactic text NOT NULL,
  mitre_technique_name text NOT NULL,
  event_type text NOT NULL, -- process, file, network, registry
  rule_logic jsonb NOT NULL DEFAULT '{}', -- conditions as JSON
  is_enabled boolean NOT NULL DEFAULT true,
  tags text[] DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

-- MITRE ATT&CK reference table
CREATE TABLE public.mitre_attack_techniques (
  technique_id text PRIMARY KEY, -- e.g. T1059.001
  tactic text NOT NULL,
  technique_name text NOT NULL,
  sub_technique_of text, -- parent technique ID
  description text,
  platforms text[] DEFAULT '{Windows,Linux,macOS}',
  data_sources text[] DEFAULT '{}',
  url text,
  created_at timestamptz NOT NULL DEFAULT now()
);

-- MITRE coverage summary per tenant
CREATE TABLE public.mitre_coverage_snapshot (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  technique_id text NOT NULL REFERENCES public.mitre_attack_techniques(technique_id),
  detection_count integer NOT NULL DEFAULT 0,
  last_detected_at timestamptz,
  coverage_status text NOT NULL DEFAULT 'not_covered', -- not_covered, partial, full
  snapshot_date date NOT NULL DEFAULT CURRENT_DATE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, technique_id, snapshot_date)
);

-- Indexes
CREATE INDEX idx_detection_rules_tenant ON public.detection_rules(tenant_id) WHERE is_enabled = true;
CREATE INDEX idx_detection_rules_event_type ON public.detection_rules(event_type) WHERE is_enabled = true;
CREATE INDEX idx_mitre_coverage_tenant ON public.mitre_coverage_snapshot(tenant_id, snapshot_date DESC);

-- RLS
ALTER TABLE public.detection_rules ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_attack_techniques ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.mitre_coverage_snapshot ENABLE ROW LEVEL SECURITY;

CREATE POLICY "service_role_full" ON public.detection_rules FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_read_rules" ON public.detection_rules FOR SELECT TO authenticated
  USING (tenant_id IS NULL OR tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

CREATE POLICY "service_role_full" ON public.mitre_attack_techniques FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "anyone_read_mitre" ON public.mitre_attack_techniques FOR SELECT TO authenticated USING (true);

CREATE POLICY "service_role_full" ON public.mitre_coverage_snapshot FOR ALL TO service_role USING (true) WITH CHECK (true);
CREATE POLICY "tenant_read_coverage" ON public.mitre_coverage_snapshot FOR SELECT TO authenticated
  USING (tenant_id IN (SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()));

-- Seed MITRE ATT&CK techniques (core EDR-relevant subset)
INSERT INTO public.mitre_attack_techniques (technique_id, tactic, technique_name, description, platforms) VALUES
  ('T1059', 'Execution', 'Command and Scripting Interpreter', 'Adversaries may abuse command and script interpreters to execute commands', '{Windows,Linux,macOS}'),
  ('T1059.001', 'Execution', 'PowerShell', 'Adversaries may abuse PowerShell commands and scripts for execution', '{Windows}'),
  ('T1059.003', 'Execution', 'Windows Command Shell', 'Adversaries may abuse the Windows command shell for execution', '{Windows}'),
  ('T1059.004', 'Execution', 'Unix Shell', 'Adversaries may abuse Unix shell commands and scripts for execution', '{Linux,macOS}'),
  ('T1003', 'Credential Access', 'OS Credential Dumping', 'Adversaries may attempt to dump credentials', '{Windows,Linux,macOS}'),
  ('T1003.001', 'Credential Access', 'LSASS Memory', 'Adversaries may attempt to access credential material stored in LSASS', '{Windows}'),
  ('T1547', 'Persistence', 'Boot or Logon Autostart Execution', 'Adversaries may configure system settings to automatically execute a program during boot', '{Windows,Linux,macOS}'),
  ('T1547.001', 'Persistence', 'Registry Run Keys / Startup Folder', 'Adversaries may achieve persistence by adding a program to a startup folder or Run key', '{Windows}'),
  ('T1218', 'Defense Evasion', 'System Binary Proxy Execution', 'Adversaries may bypass process and/or signature-based defenses by proxying execution', '{Windows}'),
  ('T1134', 'Privilege Escalation', 'Access Token Manipulation', 'Adversaries may modify access tokens to operate under different security context', '{Windows}'),
  ('T1021', 'Lateral Movement', 'Remote Services', 'Adversaries may use remote services to move laterally', '{Windows,Linux,macOS}'),
  ('T1021.002', 'Lateral Movement', 'SMB/Windows Admin Shares', 'Adversaries may use SMB to move laterally with a valid account', '{Windows}'),
  ('T1047', 'Execution', 'Windows Management Instrumentation', 'Adversaries may abuse WMI to execute malicious commands', '{Windows}'),
  ('T1486', 'Impact', 'Data Encrypted for Impact', 'Adversaries may encrypt data on target systems to disrupt operations (ransomware)', '{Windows,Linux,macOS}'),
  ('T1071', 'Command and Control', 'Application Layer Protocol', 'Adversaries may communicate using application layer protocols to avoid detection', '{Windows,Linux,macOS}'),
  ('T1027', 'Defense Evasion', 'Obfuscated Files or Information', 'Adversaries may attempt to make an executable or file difficult to discover or analyze', '{Windows,Linux,macOS}'),
  ('T1070', 'Defense Evasion', 'Indicator Removal', 'Adversaries may delete or modify artifacts generated on a host system', '{Windows,Linux,macOS}'),
  ('T1070.001', 'Defense Evasion', 'Clear Windows Event Logs', 'Adversaries may clear Windows Event Logs to hide activity', '{Windows}'),
  ('T1053', 'Persistence', 'Scheduled Task/Job', 'Adversaries may abuse task scheduling to facilitate initial or recurring execution', '{Windows,Linux,macOS}'),
  ('T1053.005', 'Persistence', 'Scheduled Task', 'Adversaries may abuse the Windows Task Scheduler for persistence', '{Windows}'),
  ('T1055', 'Defense Evasion', 'Process Injection', 'Adversaries may inject code into processes to evade defenses', '{Windows,Linux,macOS}'),
  ('T1105', 'Command and Control', 'Ingress Tool Transfer', 'Adversaries may transfer tools from external systems into compromised environment', '{Windows,Linux,macOS}'),
  ('T1036', 'Defense Evasion', 'Masquerading', 'Adversaries may manipulate features of artifacts to make them appear legitimate', '{Windows,Linux,macOS}'),
  ('T1562', 'Defense Evasion', 'Impair Defenses', 'Adversaries may maliciously modify defenses to avoid detection', '{Windows,Linux,macOS}'),
  ('T1562.001', 'Defense Evasion', 'Disable or Modify Tools', 'Adversaries may modify and/or disable security tools to avoid detection', '{Windows,Linux,macOS}'),
  ('T1048', 'Exfiltration', 'Exfiltration Over Alternative Protocol', 'Adversaries may steal data via protocol not used for C2', '{Windows,Linux,macOS}'),
  ('T1041', 'Exfiltration', 'Exfiltration Over C2 Channel', 'Adversaries may steal data by exfiltrating it over the C2 channel', '{Windows,Linux,macOS}'),
  ('T1078', 'Persistence', 'Valid Accounts', 'Adversaries may obtain and abuse credentials of existing accounts', '{Windows,Linux,macOS}'),
  ('T1110', 'Credential Access', 'Brute Force', 'Adversaries may use brute force techniques to gain access to accounts', '{Windows,Linux,macOS}'),
  ('T1190', 'Initial Access', 'Exploit Public-Facing Application', 'Adversaries may exploit software vulnerabilities in internet-facing systems', '{Windows,Linux,macOS}')
ON CONFLICT (technique_id) DO NOTHING;
