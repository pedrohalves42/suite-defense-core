-- APEX Database Optimizations: Critical Indexes (Fixed v3 - Correct schema)
-- Performance improvements for high-traffic queries

-- 1. Agents table - Optimize heartbeat queries
CREATE INDEX IF NOT EXISTS idx_agents_last_heartbeat 
ON public.agents(last_heartbeat DESC) 
WHERE status = 'active';

CREATE INDEX IF NOT EXISTS idx_agents_tenant_status 
ON public.agents(tenant_id, status, last_heartbeat DESC);

CREATE INDEX IF NOT EXISTS idx_agents_name_tenant 
ON public.agents(agent_name, tenant_id);

-- 2. Agent System Metrics - Optimize dashboard queries
CREATE INDEX IF NOT EXISTS idx_agent_metrics_agent_collected 
ON public.agent_system_metrics(agent_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_tenant_collected 
ON public.agent_system_metrics(tenant_id, collected_at DESC);

CREATE INDEX IF NOT EXISTS idx_agent_metrics_composite 
ON public.agent_system_metrics(agent_id, collected_at DESC, cpu_usage_percent, memory_usage_percent, disk_usage_percent);

-- 3. Jobs table - Optimize polling queries
CREATE INDEX IF NOT EXISTS idx_jobs_agent_status_created 
ON public.jobs(agent_name, status, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_jobs_pending 
ON public.jobs(agent_name, created_at DESC) 
WHERE status = 'pending';

CREATE INDEX IF NOT EXISTS idx_jobs_tenant_status 
ON public.jobs(tenant_id, status, created_at DESC);

-- 4. Security Logs - Optimize audit queries
CREATE INDEX IF NOT EXISTS idx_security_logs_tenant_created 
ON public.security_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_security_logs_severity_created 
ON public.security_logs(severity, created_at DESC) 
WHERE severity IN ('error', 'critical');

-- 5. Rate Limits - Optimize rate limiting checks
CREATE INDEX IF NOT EXISTS idx_rate_limits_identifier_window 
ON public.rate_limits(identifier, window_start DESC);

-- 6. Failed Login Attempts - Optimize brute force detection
CREATE INDEX IF NOT EXISTS idx_failed_logins_ip_created 
ON public.failed_login_attempts(ip_address, created_at DESC);

-- 7. User Roles - Optimize authorization checks
CREATE INDEX IF NOT EXISTS idx_user_roles_user_tenant 
ON public.user_roles(user_id, tenant_id);

CREATE INDEX IF NOT EXISTS idx_user_roles_tenant_role 
ON public.user_roles(tenant_id, role);

-- 8. Enrollment Keys - Optimize key validation
CREATE INDEX IF NOT EXISTS idx_enrollment_keys_active_key 
ON public.enrollment_keys(key, is_active, expires_at) 
WHERE is_active = true;

CREATE INDEX IF NOT EXISTS idx_enrollment_keys_tenant_active 
ON public.enrollment_keys(tenant_id, is_active, expires_at);

-- 9. Tenant Subscriptions - Optimize plan checks
CREATE INDEX IF NOT EXISTS idx_tenant_subscriptions_active 
ON public.tenant_subscriptions(tenant_id, status) 
WHERE status = 'active';

-- 10. Virus Scans - Optimize scan history queries (correct columns)
CREATE INDEX IF NOT EXISTS idx_virus_scans_agent_scanned 
ON public.virus_scans(agent_name, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_virus_scans_tenant_scanned 
ON public.virus_scans(tenant_id, scanned_at DESC);

CREATE INDEX IF NOT EXISTS idx_virus_scans_hash 
ON public.virus_scans(file_hash);

-- 11. Installation Analytics - Optimize dashboard queries
CREATE INDEX IF NOT EXISTS idx_installation_analytics_tenant_date 
ON public.installation_analytics(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_installation_analytics_platform 
ON public.installation_analytics(tenant_id, platform, event_type, created_at DESC);

-- 12. Audit Logs - Optimize audit queries
CREATE INDEX IF NOT EXISTS idx_audit_logs_tenant_created 
ON public.audit_logs(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_user_created 
ON public.audit_logs(user_id, created_at DESC);

COMMENT ON INDEX public.idx_agents_last_heartbeat IS 'APEX: Optimize heartbeat queries for active agents';
COMMENT ON INDEX public.idx_agent_metrics_agent_collected IS 'APEX: Optimize dashboard metrics retrieval';
COMMENT ON INDEX public.idx_jobs_pending IS 'APEX: Optimize job polling for agents';
COMMENT ON INDEX public.idx_security_logs_severity_created IS 'APEX: Optimize critical security log queries';
COMMENT ON INDEX public.idx_rate_limits_identifier_window IS 'APEX: Optimize rate limit checks';
COMMENT ON INDEX public.idx_failed_logins_ip_created IS 'APEX: Optimize brute force detection';
