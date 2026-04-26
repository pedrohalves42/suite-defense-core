-- TUNING v11: Composite indexes for hot query patterns

-- 1. Jobs: tenant + status + created_at (dashboard, stuck job queries)
CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status_created 
ON public.jobs (tenant_id, status, created_at DESC);

-- 2. Jobs: delivered with delivered_at for stuck detection
CREATE INDEX IF NOT EXISTS idx_jobs_delivered_at 
ON public.jobs (status, delivered_at ASC) 
WHERE status = 'delivered';

-- 3. Agent tokens: token_hash partial (poll-jobs hot path)
CREATE INDEX IF NOT EXISTS idx_agent_tokens_hash_active 
ON public.agent_tokens (token_hash) 
WHERE is_active = true;

-- 4. Security logs: tenant + created_at
CREATE INDEX IF NOT EXISTS idx_security_logs_tenant_created 
ON public.security_logs (tenant_id, created_at DESC);

-- 5. AI insights: tenant + unacknowledged
CREATE INDEX IF NOT EXISTS idx_ai_insights_tenant_unacked 
ON public.ai_insights (tenant_id) 
WHERE acknowledged = false;

-- 6. Vuln scans: tenant + severity
CREATE INDEX IF NOT EXISTS idx_vuln_scans_tenant_severity 
ON public.agent_vulnerability_scans (tenant_id, severity);

-- 7. System alerts: tenant + active
CREATE INDEX IF NOT EXISTS idx_system_alerts_tenant_active 
ON public.system_alerts (tenant_id, severity) 
WHERE resolved = false;

-- 8. Performance metrics: created_at
CREATE INDEX IF NOT EXISTS idx_performance_metrics_created 
ON public.performance_metrics (created_at DESC);

-- 9. Evidence logs: tenant + created_at
CREATE INDEX IF NOT EXISTS idx_evidence_logs_tenant_created 
ON public.agent_evidence_logs (tenant_id, created_at DESC);

-- 10. Blocked attempts: tenant + date
CREATE INDEX IF NOT EXISTS idx_blocked_attempts_tenant_date 
ON public.blocked_access_attempts (tenant_id, attempted_at DESC);