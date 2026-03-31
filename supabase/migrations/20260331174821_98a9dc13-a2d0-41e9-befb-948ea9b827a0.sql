
-- Add trace_id column to core log/event tables for distributed tracing correlation
-- Using TEXT (not UUID) to support external trace formats (e.g., W3C traceparent)
-- Only adding index on high-volume tables for cost efficiency

-- 1. audit_logs (partitioned table - column propagates to all partitions)
ALTER TABLE public.audit_logs ADD COLUMN IF NOT EXISTS trace_id text;

-- 2. security_logs
ALTER TABLE public.security_logs ADD COLUMN IF NOT EXISTS trace_id text;

-- 3. security_events
ALTER TABLE public.security_events ADD COLUMN IF NOT EXISTS trace_id text;

-- 4. domain_events
ALTER TABLE public.domain_events ADD COLUMN IF NOT EXISTS trace_id text;

-- 5. agent_evidence_logs
ALTER TABLE public.agent_evidence_logs ADD COLUMN IF NOT EXISTS trace_id text;

-- 6. ai_action_logs
ALTER TABLE public.ai_action_logs ADD COLUMN IF NOT EXISTS trace_id text;

-- 7. api_request_logs
ALTER TABLE public.api_request_logs ADD COLUMN IF NOT EXISTS trace_id text;

-- 8. automation_decision_log
ALTER TABLE public.automation_decision_log ADD COLUMN IF NOT EXISTS trace_id text;

-- 9. automation_execution_log
ALTER TABLE public.automation_execution_log ADD COLUMN IF NOT EXISTS trace_id text;

-- 10. notification_log
ALTER TABLE public.notification_log ADD COLUMN IF NOT EXISTS trace_id text;

-- 11. policy_enforcement_logs
ALTER TABLE public.policy_enforcement_logs ADD COLUMN IF NOT EXISTS trace_id text;

-- 12. risk_decision_log
ALTER TABLE public.risk_decision_log ADD COLUMN IF NOT EXISTS trace_id text;

-- 13. score_governance_log
ALTER TABLE public.score_governance_log ADD COLUMN IF NOT EXISTS trace_id text;

-- 14. system_alerts
ALTER TABLE public.system_alerts ADD COLUMN IF NOT EXISTS trace_id text;

-- 15. system_audits
ALTER TABLE public.system_audits ADD COLUMN IF NOT EXISTS trace_id text;

-- Indexes only on high-volume tables (cost-efficient approach)
-- Using btree for exact-match lookups; partial index excludes NULLs
CREATE INDEX IF NOT EXISTS idx_audit_logs_trace_id ON public.audit_logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_domain_events_trace_id ON public.domain_events (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_agent_evidence_logs_trace_id ON public.agent_evidence_logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_events_trace_id ON public.security_events (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_ai_action_logs_trace_id ON public.ai_action_logs (trace_id) WHERE trace_id IS NOT NULL;
CREATE INDEX IF NOT EXISTS idx_security_logs_trace_id ON public.security_logs (trace_id) WHERE trace_id IS NOT NULL;

-- Correlation helper: find all logs for a given trace
CREATE OR REPLACE FUNCTION public.get_trace_timeline(p_trace_id text)
RETURNS TABLE(
  source text,
  event_id uuid,
  event_type text,
  created_at timestamptz,
  tenant_id uuid,
  summary text
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT 'audit_logs'::text, id, action, created_at, tenant_id, resource_type || ':' || COALESCE(resource_id, '?')
  FROM audit_logs WHERE trace_id = p_trace_id
  UNION ALL
  SELECT 'domain_events'::text, id, event_type, created_at, tenant_id, aggregate_type || ':' || COALESCE(aggregate_id, '?')
  FROM domain_events WHERE trace_id = p_trace_id
  UNION ALL
  SELECT 'security_events'::text, id, event_type, created_at, tenant_id, COALESCE(description, event_type)
  FROM security_events WHERE trace_id = p_trace_id
  UNION ALL
  SELECT 'agent_evidence_logs'::text, id, event_type, created_at, tenant_id, agent_name || ':' || COALESCE(state_before, '') || '->' || COALESCE(state_after, '')
  FROM agent_evidence_logs WHERE trace_id = p_trace_id
  UNION ALL
  SELECT 'ai_action_logs'::text, id, action_type, created_at, tenant_id, COALESCE(action_type, 'ai_action')
  FROM ai_action_logs WHERE trace_id = p_trace_id
  ORDER BY created_at ASC;
$$;
