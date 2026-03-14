
-- =============================================================================
-- PERFORMANCE TUNING: Missing indexes for hot query paths
-- =============================================================================

-- 1. ai_insights: tenant + unacknowledged filter
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_unacked
ON public.ai_insights (tenant_id)
WHERE acknowledged = false;

-- 2. tasks: filtered status queries with sort
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_status_severity
ON public.tasks (tenant_id, severity, created_at DESC)
WHERE status IN ('open', 'in_progress', 'blocked');

-- 3. tasks: open count badge
CREATE INDEX IF NOT EXISTS idx_tasks_tenant_open_count
ON public.tasks (tenant_id)
WHERE status IN ('open', 'in_progress');

-- 4. vuln_findings: tenant + severity
CREATE INDEX IF NOT EXISTS idx_vuln_findings_tenant_severity
ON public.vuln_findings (tenant_id, severity);

-- 5. system_alerts: active alerts fast lookup
CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_active
ON public.system_alerts (tenant_id, created_at DESC)
WHERE status IN ('active', 'open', 'pending');

-- 6. agent_tokens: dashboard listing
CREATE INDEX IF NOT EXISTS idx_agent_tokens_tenant_created
ON public.agent_tokens (tenant_id, created_at DESC);

-- 7. heartbeat hot path: token hash lookup
CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash_active
ON public.agent_tokens (token_hash)
WHERE is_active = true;
