
-- =============================================
-- CORREÇÃO 1: Job type alignment with agent v5.0.3
-- CORREÇÃO 2: Functional automation rules  
-- CORREÇÃO 6: Missing tables for SOAR operations
-- =============================================

-- 1.1 Cancel all pending/queued unsupported job types
UPDATE jobs 
SET status = 'cancelled',
    error_message = '[CANCELLED:UNSUPPORTED_JOB_TYPE] Job type not supported by agent v5.0.3',
    completed_at = now()
WHERE status IN ('pending', 'queued')
  AND type IN ('light_vuln_scan', 'collect_web_activity', 'update_agent', 'deep_system_scan', 'network_discovery');

-- 1.2 Validation trigger: only allow supported job types
CREATE OR REPLACE FUNCTION validate_job_type_for_agent()
RETURNS trigger AS $$
DECLARE
  supported_types text[] := ARRAY[
    'software_inventory_collect',
    'collect_antivirus_status',
    'sync_blocked_websites',
    'service_health_check',
    'collect_network_info',
    'reinstall_agent',
    'network_diagnostics'
  ];
BEGIN
  IF NOT (NEW.type = ANY(supported_types)) THEN
    RAISE EXCEPTION 'Job type "%" not supported by agent v5.0.3. Supported: %', NEW.type, array_to_string(supported_types, ', ')
      USING ERRCODE = '23514';
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_validate_job_type ON jobs;
CREATE TRIGGER trg_validate_job_type
  BEFORE INSERT ON jobs
  FOR EACH ROW EXECUTE FUNCTION validate_job_type_for_agent();

-- 2.1 Insert default automation rules (using actual schema columns)
-- First get a tenant_id to associate rules with
DO $$
DECLARE
  v_tenant_id uuid;
BEGIN
  SELECT id INTO v_tenant_id FROM tenants ORDER BY created_at ASC LIMIT 1;
  
  IF v_tenant_id IS NULL THEN
    RAISE NOTICE 'No tenants found, skipping automation rules';
    RETURN;
  END IF;

  -- High CPU Alert
  INSERT INTO automation_rules (tenant_id, name, description, is_active, trigger_type, trigger_conditions, action_type, action_config, target_scope, cooldown_minutes, priority)
  VALUES (
    v_tenant_id,
    'High CPU Alert',
    'Alert when agent CPU exceeds 90% for 5 minutes',
    true,
    'metric_threshold',
    '{"metric": "cpu_percent", "operator": ">", "value": 90, "duration_minutes": 5}'::jsonb,
    'create_alert',
    '{"alert_channel": "system", "params": {"severity": "high", "message": "High CPU usage detected"}}'::jsonb,
    'all_agents',
    15,
    1
  ) ON CONFLICT DO NOTHING;

  -- Low Disk Space
  INSERT INTO automation_rules (tenant_id, name, description, is_active, trigger_type, trigger_conditions, action_type, action_config, target_scope, cooldown_minutes, priority)
  VALUES (
    v_tenant_id,
    'Low Disk Space Alert',
    'Alert when disk free space below 10%',
    true,
    'metric_threshold',
    '{"metric": "disk_free_percent", "operator": "<", "value": 10, "duration_minutes": 1}'::jsonb,
    'create_alert',
    '{"alert_channel": "system", "params": {"severity": "high", "message": "Low disk space detected"}}'::jsonb,
    'all_agents',
    30,
    2
  ) ON CONFLICT DO NOTHING;

  -- Agent Offline
  INSERT INTO automation_rules (tenant_id, name, description, is_active, trigger_type, trigger_conditions, action_type, action_config, target_scope, cooldown_minutes, priority)
  VALUES (
    v_tenant_id,
    'Agent Offline Detection',
    'Alert when agent offline for > 10 minutes',
    true,
    'agent_status',
    '{"eventType": "agent_offline", "duration_minutes": 10}'::jsonb,
    'create_alert',
    '{"alert_channel": "system", "params": {"severity": "medium", "message": "Agent offline detected"}}'::jsonb,
    'all_agents',
    60,
    3
  ) ON CONFLICT DO NOTHING;

  -- Suspicious Process
  INSERT INTO automation_rules (tenant_id, name, description, is_active, trigger_type, trigger_conditions, action_type, action_config, target_scope, cooldown_minutes, priority)
  VALUES (
    v_tenant_id,
    'Suspicious Process Detection',
    'Alert on high-CPU suspicious processes',
    true,
    'anomaly_detection',
    '{"eventType": "suspicious_process", "severity": "high"}'::jsonb,
    'create_alert',
    '{"alert_channel": "system", "params": {"severity": "high", "message": "Suspicious process detected"}}'::jsonb,
    'all_agents',
    5,
    1
  ) ON CONFLICT DO NOTHING;

  RAISE NOTICE 'Inserted automation rules for tenant %', v_tenant_id;
END $$;

-- 6.1 Create notification_deliveries table
CREATE TABLE IF NOT EXISTS public.notification_deliveries (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id),
  alert_id uuid REFERENCES system_alerts(id),
  channel text NOT NULL CHECK (channel IN ('email', 'telegram', 'whatsapp', 'slack')),
  recipient text NOT NULL,
  subject text,
  message text NOT NULL,
  status text NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'delivered', 'failed')),
  delivered_at timestamptz,
  error_message text,
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.notification_deliveries ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for notification_deliveries"
  ON public.notification_deliveries FOR ALL
  USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'active_tenant_id')::uuid);

CREATE POLICY "Service role full access on notification_deliveries"
  ON public.notification_deliveries FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 6.2 Create agent_quarantine table
CREATE TABLE IF NOT EXISTS public.agent_quarantine (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  quarantine_reason text NOT NULL,
  severity text NOT NULL DEFAULT 'high',
  duration_hours integer NOT NULL DEFAULT 24,
  restrict_network boolean DEFAULT true,
  restrict_processes boolean DEFAULT true,
  restrict_file_access boolean DEFAULT true,
  quarantined_by text NOT NULL DEFAULT 'system',
  quarantine_end timestamptz,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'released', 'expired')),
  created_at timestamptz DEFAULT now(),
  released_at timestamptz,
  released_by text
);

ALTER TABLE public.agent_quarantine ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for agent_quarantine"
  ON public.agent_quarantine FOR ALL
  USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'active_tenant_id')::uuid);

CREATE POLICY "Service role full access on agent_quarantine"
  ON public.agent_quarantine FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- 6.3 Create agent_vulnerabilities table
CREATE TABLE IF NOT EXISTS public.agent_vulnerabilities (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES tenants(id),
  cve_id text NOT NULL,
  severity text NOT NULL DEFAULT 'medium',
  cvss_score numeric,
  affected_software text,
  remediation_status text NOT NULL DEFAULT 'pending' CHECK (remediation_status IN ('pending', 'remediating', 'remediated', 'failed', 'accepted')),
  remediation_started_at timestamptz,
  remediation_completed_at timestamptz,
  detected_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now()
);

ALTER TABLE public.agent_vulnerabilities ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Tenant isolation for agent_vulnerabilities"
  ON public.agent_vulnerabilities FOR ALL
  USING (tenant_id = (current_setting('request.jwt.claims', true)::jsonb->>'active_tenant_id')::uuid);

CREATE POLICY "Service role full access on agent_vulnerabilities"
  ON public.agent_vulnerabilities FOR ALL
  TO service_role USING (true) WITH CHECK (true);

-- Indexes for performance
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_alert ON notification_deliveries(alert_id);
CREATE INDEX IF NOT EXISTS idx_notification_deliveries_tenant ON notification_deliveries(tenant_id);
CREATE INDEX IF NOT EXISTS idx_agent_quarantine_agent ON agent_quarantine(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_quarantine_status ON agent_quarantine(status);
CREATE INDEX IF NOT EXISTS idx_agent_vulnerabilities_agent ON agent_vulnerabilities(agent_id);
CREATE INDEX IF NOT EXISTS idx_agent_vulnerabilities_cve ON agent_vulnerabilities(cve_id);
CREATE INDEX IF NOT EXISTS idx_agent_vulnerabilities_status ON agent_vulnerabilities(remediation_status);
