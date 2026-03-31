/**
 * serve-dns-filter — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, requestId } = ctx;

  logger.info(`[${requestId}] Authenticated agent: ${agentName}`);

  // Check if tenant has DNS filter enabled
  const { data: tenantSettings } = await supabase
    .from('tenant_settings')
    .select('dns_local_filter_enabled')
    .eq('tenant_id', tenantId)
    .single();

  if (!tenantSettings?.dns_local_filter_enabled) {
    return new Response(
      JSON.stringify({ error: 'DNS filter not enabled for this tenant', enabled: false }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch blocked domains
  let blockedDomains: string[] = [];
  try {
    const { data: policies } = await supabase
      .from('dns_filter_policies')
      .select('domain, is_blocked')
      .eq('tenant_id', tenantId)
      .eq('is_blocked', true);

    if (policies?.length) {
      blockedDomains = policies.map((p: { domain: string }) => p.domain).filter(Boolean);
    }
  } catch (e) {
    logger.warn(`[${requestId}] Failed to fetch DNS policies: ${(e as Error).message}`);
  }

  // Also check blocked_websites table
  try {
    const { data: blockedSites } = await supabase
      .from('blocked_websites')
      .select('domain_pattern')
      .eq('tenant_id', tenantId)
      .eq('is_active', true);

    if (blockedSites?.length) {
      for (const site of blockedSites) {
        const domain = (site as { domain_pattern?: string }).domain_pattern;
        if (domain && !blockedDomains.includes(domain)) {
          blockedDomains.push(domain);
        }
      }
    }
  } catch { /* blocked_websites may not exist */ }

  logger.info(`[${requestId}] Serving ${blockedDomains.length} blocked domains to ${agentName}`);

  return {
    domains: blockedDomains,
    count: blockedDomains.length,
    config: { listen_addr: '127.0.0.1:53', upstream_dns: '1.1.1.1:53', fallback_dns: '8.8.8.8:53' },
    served_at: new Date().toISOString(),
  };
}, {
  hmacVerify: true,
});
