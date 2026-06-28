import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

/**
 * Agent policy contract (D18-1 / LATENT-DEPLOY-POLICY-01).
 *
 * Sources of truth (verified against the live schema in database.types.ts):
 *
 *  - public.tenant_settings
 *      • dns_local_filter_enabled : boolean | null  → controls `dns_enabled`
 *        and `dns_service_running` in the policy.
 *      (Legacy code referenced `dns_enabled`, `heartbeat_interval`,
 *       `dns_upstream`, `blocked_categories` and a `setting_key/value` shape
 *       — none of those columns ever existed. References removed.)
 *
 *  - public.tenant_version_policies
 *      • min_version : text | null  → overrides `agent_min_version` when the
 *        tenant pinned a minimum agent version. Falls back to the latest
 *        active Windows release, then to a hard-coded floor.
 *
 *  - public.agent_releases
 *      • latest active Windows release → default `agent_min_version`.
 *
 *  - public.blocked_websites (count)
 *      • exposed as `blocked_domains_count`.
 *
 * Fields not backed by a column (heartbeat_interval_max, dns_upstream,
 * blocked_categories, custom_rules) are intentionally served as static
 * defaults until per-tenant configuration is introduced. This preserves the
 * pre-existing behavior every agent has been receiving in production.
 */
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

const DEFAULT_HEARTBEAT_INTERVAL_MAX = 120;
const DEFAULT_DNS_UPSTREAM: string[] = ["8.8.8.8:53", "1.1.1.1:53"];
const DEFAULT_AGENT_MIN_VERSION = "v4.0.0";

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, requestId } = ctx;

  // Read only columns that actually exist on tenant_settings.
  const { data: tenantSettings } = await supabase
    .from('tenant_settings')
    .select('dns_local_filter_enabled')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // Tenant-pinned minimum agent version (optional).
  const { data: versionPolicy } = await supabase
    .from('tenant_version_policies')
    .select('min_version')
    .eq('tenant_id', tenantId)
    .maybeSingle();

  // Latest active Windows release as the default minimum version.
  const { data: latestVersion } = await supabase
    .from('agent_releases')
    .select('version')
    .eq('platform', 'windows')
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  const dnsEnabled = tenantSettings?.dns_local_filter_enabled ?? true;
  const agentMinVersion =
    versionPolicy?.min_version ?? latestVersion?.version ?? DEFAULT_AGENT_MIN_VERSION;

  const policy: PolicyContract = {
    version: "2025-01-v1",
    expected: {
      dns_enabled: dnsEnabled,
      dns_service_running: dnsEnabled,
      dns_filter_available: false,
      agent_min_version: agentMinVersion,
      blocked_domains_synced: true,
      heartbeat_interval_max: DEFAULT_HEARTBEAT_INTERVAL_MAX,
      job_execution_enabled: true,
    },
    tenant_config: {
      dns_upstream: DEFAULT_DNS_UPSTREAM,
      blocked_categories: [],
      custom_rules: [],
    },
  };

  const { count: blockedCount } = await supabase
    .from('blocked_websites')
    .select('*', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  logger.info(
    `[get-agent-policy][${requestId}] Policy sent to ${agentName} ` +
    `(dns_enabled=${dnsEnabled}, min_version=${agentMinVersion}, ` +
    `blocked_domains=${blockedCount ?? 0})`
  );

  return {
    ...policy,
    blocked_domains_count: blockedCount ?? 0,
    agent_name: agentName,
    tenant_id: tenantId,
  };
}, {
  extraAgentFields: ['agent_name'],
});
