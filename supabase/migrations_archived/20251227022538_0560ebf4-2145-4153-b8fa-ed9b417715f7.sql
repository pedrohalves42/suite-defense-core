-- =====================================================
-- RULES ENGINE v1: Decision Rules & Events Tables
-- =====================================================

-- Table: decision_rules
-- Stores formal rule definitions for the decision engine
CREATE TABLE public.decision_rules (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  code text UNIQUE NOT NULL,
  is_enabled boolean NOT NULL DEFAULT true,
  description text NOT NULL,
  scope text NOT NULL DEFAULT 'agent',
  definition jsonb NOT NULL DEFAULT '{}',
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz DEFAULT now()
);

-- Enable RLS
ALTER TABLE public.decision_rules ENABLE ROW LEVEL SECURITY;

-- Policies: Admins and super admins can view rules
CREATE POLICY "Admins can view decision rules"
ON public.decision_rules FOR SELECT
USING (
  EXISTS (
    SELECT 1 FROM user_roles
    WHERE user_roles.user_id = auth.uid()
    AND user_roles.role IN ('admin', 'super_admin')
  )
);

-- Super admins can manage rules
CREATE POLICY "Super admins can manage decision rules"
ON public.decision_rules FOR ALL
USING (is_super_admin(auth.uid()))
WITH CHECK (is_super_admin(auth.uid()));

-- Insert the first formal rule: SAFE_MODE_RULE_001
INSERT INTO public.decision_rules (code, description, scope, definition)
VALUES (
  'SAFE_MODE_RULE_001',
  'Enter SAFE_MODE after 3 identical failures in 10 minutes while agent is online',
  'agent',
  '{
    "conditions": {
      "time_window_minutes": 10,
      "min_failures": 3,
      "group_by": "error_signature",
      "agent_must_be_online": true,
      "agent_not_in_safe_mode": true,
      "heartbeat_max_age_seconds": 300
    },
    "actions": ["ENTER_SAFE_MODE", "CREATE_AI_INSIGHT", "CREATE_SYSTEM_ALERT", "FORENSIC_SNAPSHOT", "SEND_NOTIFICATION"]
  }'::jsonb
);

-- Table: decision_events
-- Audit trail for all automated decisions made by the engine
CREATE TABLE public.decision_events (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  rule_code text NOT NULL,
  agent_id uuid REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name text,
  action text NOT NULL,
  evidence jsonb NOT NULL DEFAULT '{}',
  actions_executed jsonb DEFAULT '[]',
  created_at timestamptz NOT NULL DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_decision_events_tenant ON public.decision_events(tenant_id);
CREATE INDEX idx_decision_events_rule ON public.decision_events(rule_code);
CREATE INDEX idx_decision_events_agent ON public.decision_events(agent_id);
CREATE INDEX idx_decision_events_created ON public.decision_events(created_at DESC);
CREATE INDEX idx_decision_events_tenant_created ON public.decision_events(tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.decision_events ENABLE ROW LEVEL SECURITY;

-- Policies: Users can view events in their tenant
CREATE POLICY "Users can view decision events in their tenant"
ON public.decision_events FOR SELECT
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM user_roles ur
    WHERE ur.user_id = auth.uid()
  )
);

-- Super admins can view all
CREATE POLICY "Super admins can view all decision events"
ON public.decision_events FOR SELECT
USING (is_super_admin(auth.uid()));

-- Service role can insert (edge functions)
CREATE POLICY "Service role can insert decision events"
ON public.decision_events FOR INSERT
WITH CHECK (true);

-- Comment for documentation
COMMENT ON TABLE public.decision_rules IS 'Formal rule definitions for the automated decision engine';
COMMENT ON TABLE public.decision_events IS 'Audit trail for all automated decisions with evidence and actions executed';
COMMENT ON COLUMN public.decision_events.evidence IS 'JSON containing all data that triggered the decision';
COMMENT ON COLUMN public.decision_events.actions_executed IS 'Array of actions taken with success/failure status';