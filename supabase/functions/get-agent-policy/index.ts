import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface PolicyContract {
  version: string;
  expected: {
    dns_enabled: boolean;
    dns_service_running: boolean;
    dns_filter_available: boolean;
    agent_min_version: string;
    blocked_domains_synced: boolean;
    heartbeat_interval_max: number;
    job_execution_enabled: boolean;
  };
  tenant_config?: {
    dns_upstream?: string[];
    blocked_categories?: string[];
    custom_rules?: Record<string, unknown>[];
  };
}

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId } = ctx;

  // Get tenant settings
  const { data: tenantSettings } = await supabase
    .from('tenant_settings')
    .select('*')
    .eq('tenant_id', tenantId)
    .single();

  // Get latest agent version
  const { data: latestVersion } = await supabase
    .from('agent_releases')
    .select('version')
    .eq('platform', 'windows')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .single();

  // Build policy contract
  const policy: PolicyContract = {
    version: "2025-01-v1",
    expected: {
      dns_enabled: tenantSettings?.dns_enabled ?? true,
      dns_service_running: tenantSettings?.dns_enabled ?? true,
      dns_filter_available: false,
      agent_min_version: latestVersion?.version ?? "v4.0.0",
      blocked_domains_synced: true,
      heartbeat_interval_max: tenantSettings?.heartbeat_interval ?? 120,
      job_execution_enabled: true,
    },
    tenant_config: {
      dns_upstream: tenantSettings?.dns_upstream ?? ["8.8.8.8:53", "1.1.1.1:53"],
      blocked_categories: tenantSettings?.blocked_categories ?? [],
      custom_rules: [],
    },
  };

  // Get blocked domains count
  const { count: blockedCount } = await supabase
    .from('blocked_websites')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  logger.info(`[get-agent-policy][${requestId}] Policy sent to ${agentName} (blocked domains: ${blockedCount ?? 0})`);

  return {
    ...policy,
    blocked_domains_count: blockedCount ?? 0,
    agent_name: agentName,
    tenant_id: tenantId,
  };
}, {
  extraAgentFields: ['agent_name'],
});
