
-- =============================================
-- Phase 5: agent_processes table
-- Stores process and service snapshots from Windows agents
-- =============================================

CREATE TABLE public.agent_processes (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  agent_id uuid NOT NULL REFERENCES public.agents(id) ON DELETE CASCADE,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  
  -- Process list snapshot (top N by CPU/memory)
  processes jsonb NOT NULL DEFAULT '[]'::jsonb,
  -- Windows Services snapshot
  services jsonb NOT NULL DEFAULT '[]'::jsonb,
  
  -- Summary stats
  total_processes integer,
  total_services integer,
  services_running integer,
  services_stopped integer,
  
  -- Anomaly detection baseline
  new_processes jsonb DEFAULT '[]'::jsonb,  -- Processes not in previous snapshot
  suspicious_processes jsonb DEFAULT '[]'::jsonb,  -- Flagged by heuristics
  
  collected_at timestamptz NOT NULL DEFAULT now(),
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.agent_processes ENABLE ROW LEVEL SECURITY;

-- SELECT: tenant isolation via user_roles subquery (robust pattern)
CREATE POLICY "Users can view processes for their tenant agents"
ON public.agent_processes
FOR SELECT TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
  OR EXISTS (
    SELECT 1 FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role = 'super_admin'
  )
);

-- INSERT: service_role only (agents submit via Edge Functions with service key)
CREATE POLICY "Service role can insert process data"
ON public.agent_processes
FOR INSERT TO service_role
WITH CHECK (true);

-- DELETE: service_role only (cleanup crons)
CREATE POLICY "Service role can delete old process data"
ON public.agent_processes
FOR DELETE TO service_role
USING (true);

-- Performance indexes
CREATE INDEX idx_agent_processes_agent_time 
ON public.agent_processes(agent_id, collected_at DESC);

CREATE INDEX idx_agent_processes_tenant_time 
ON public.agent_processes(tenant_id, collected_at DESC);

-- Document service_role usage for compliance (V-103 pattern)
COMMENT ON TABLE public.agent_processes IS 
'Process and service snapshots from Windows agents. INSERT/DELETE restricted to service_role because agents authenticate via x-agent-token in Edge Functions, not Supabase JWT. SSA-SEC compliant.';

-- =============================================
-- Phase 6: automation_rules table
-- Rules engine for auto-healing responses
-- =============================================

CREATE TABLE public.automation_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  
  -- Rule definition
  name text NOT NULL,
  description text,
  is_active boolean NOT NULL DEFAULT true,
  
  -- Trigger conditions
  trigger_type text NOT NULL, -- 'metric_threshold', 'security_event', 'process_anomaly', 'vulnerability'
  trigger_conditions jsonb NOT NULL, -- e.g. {"metric": "cpu_usage_percent", "operator": ">", "value": 90, "duration_minutes": 5}
  
  -- Action to take
  action_type text NOT NULL, -- 'create_job', 'send_alert', 'quarantine', 'run_playbook'
  action_config jsonb NOT NULL, -- e.g. {"job_type": "restart_service", "params": {...}}
  
  -- Scope
  target_scope text NOT NULL DEFAULT 'all_agents', -- 'all_agents', 'group', 'specific_agent'
  target_ids uuid[] DEFAULT '{}', -- Agent or group IDs for scoped rules
  
  -- Cooldown to prevent alert storms
  cooldown_minutes integer NOT NULL DEFAULT 30,
  last_triggered_at timestamptz,
  trigger_count integer NOT NULL DEFAULT 0,
  
  -- Metadata
  priority integer NOT NULL DEFAULT 5, -- 1 (highest) to 10 (lowest)
  created_by uuid REFERENCES auth.users(id),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_rules ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation rules for their tenant"
ON public.automation_rules
FOR SELECT TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

CREATE POLICY "Admins can manage automation rules"
ON public.automation_rules
FOR ALL TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
  )
)
WITH CHECK (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur 
    WHERE ur.user_id = auth.uid() AND ur.role IN ('admin', 'super_admin')
  )
);

-- Automation execution log
CREATE TABLE public.automation_executions (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id),
  rule_id uuid NOT NULL REFERENCES public.automation_rules(id) ON DELETE CASCADE,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  
  -- Trigger context
  trigger_data jsonb NOT NULL, -- Snapshot of the data that triggered the rule
  
  -- Execution details
  action_taken text NOT NULL,
  action_result jsonb, -- Result of the action (job_id, alert_id, etc.)
  status text NOT NULL DEFAULT 'pending', -- 'pending', 'executed', 'failed', 'skipped_cooldown'
  error_message text,
  
  -- Timing
  triggered_at timestamptz NOT NULL DEFAULT now(),
  executed_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.automation_executions ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view automation executions for their tenant"
ON public.automation_executions
FOR SELECT TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);

CREATE POLICY "Service role can insert automation executions"
ON public.automation_executions
FOR INSERT TO service_role
WITH CHECK (true);

CREATE POLICY "Service role can update automation executions"
ON public.automation_executions
FOR UPDATE TO service_role
USING (true);

-- Indexes
CREATE INDEX idx_automation_rules_tenant_active 
ON public.automation_rules(tenant_id, is_active) WHERE is_active = true;

CREATE INDEX idx_automation_rules_trigger_type 
ON public.automation_rules(trigger_type) WHERE is_active = true;

CREATE INDEX idx_automation_executions_rule_time 
ON public.automation_executions(rule_id, triggered_at DESC);

CREATE INDEX idx_automation_executions_tenant_time 
ON public.automation_executions(tenant_id, triggered_at DESC);

CREATE INDEX idx_automation_executions_status 
ON public.automation_executions(status) WHERE status = 'pending';

COMMENT ON TABLE public.automation_rules IS 
'Auto-healing rules engine. Defines conditions and actions for automated responses to security events and metric anomalies. Managed by tenant admins.';

COMMENT ON TABLE public.automation_executions IS 
'Execution log for automation rules. INSERT/UPDATE restricted to service_role because the automation engine runs in Edge Functions. SSA-SEC compliant.';

-- Updated_at trigger for automation_rules
CREATE TRIGGER update_automation_rules_updated_at
BEFORE UPDATE ON public.automation_rules
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at_column();
