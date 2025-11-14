-- Performance indexes for dashboard queries
-- Indexes for v_agent_lifecycle_state (InstallationPipelineMonitor)
CREATE INDEX IF NOT EXISTS idx_agents_tenant_enrolled 
ON public.agents(tenant_id, enrolled_at DESC);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_heartbeat 
ON public.agents(tenant_id, last_heartbeat DESC NULLS LAST);

CREATE INDEX IF NOT EXISTS idx_agents_tenant_status 
ON public.agents(tenant_id, status);

-- Indexes for installation_analytics (InstallationLogsExplorer)
CREATE INDEX IF NOT EXISTS idx_installation_analytics_agent_event 
ON public.installation_analytics(agent_id, event_type, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_installation_analytics_tenant_created 
ON public.installation_analytics(tenant_id, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_installation_analytics_success 
ON public.installation_analytics(tenant_id, success, created_at DESC) 
WHERE event_type IN ('post_installation', 'post_installation_unverified');

-- Index for detect-stuck-installations
CREATE INDEX IF NOT EXISTS idx_installation_analytics_command_copied 
ON public.installation_analytics(agent_id, event_type, created_at DESC) 
WHERE event_type = 'command_copied';

-- Analyze tables for query optimizer
ANALYZE public.agents;
ANALYZE public.installation_analytics;