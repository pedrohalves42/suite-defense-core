/**
 * get-blocked-websites — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId } = ctx;

  logger.info(`[get-blocked-websites] Agent: ${agentName}, tenant: ${tenantId}`);

  // Fetch agent's groups
  const { data: agentGroups } = await supabase
    .from('agents_groups')
    .select('group_id')
    .eq('agent_id', agentId);

  const groupIds = agentGroups?.map(g => g.group_id) || [];

  // Fetch blocked websites
  const { data: blockedSites, error: blockedError } = await supabase
    .from('blocked_websites')
    .select('domain_pattern, reason, group_id')
    .eq('tenant_id', tenantId)
    .eq('is_active', true);

  if (blockedError) {
    logger.error('Failed to fetch blocked websites', blockedError);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch blocked websites' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Fetch from security policies
  const { data: policyRules, error: rulesError } = await supabase
    .from('security_policy_rules')
    .select('target, conditions, security_policies!inner(tenant_id, is_active)')
    .eq('rule_type', 'website_block')
    .eq('action', 'block')
    .eq('is_enabled', true);

  const blockedWebsites: Array<{ domain_pattern: string; reason: string | null }> = [];

  if (blockedSites) {
    for (const site of blockedSites) {
      if (site.domain_pattern) {
        const isGlobal = !site.group_id;
        const isInAgentGroup = site.group_id && groupIds.includes(site.group_id);
        if (isGlobal || isInAgentGroup) {
          blockedWebsites.push({ domain_pattern: site.domain_pattern, reason: site.reason });
        }
      }
    }
  }

  if (policyRules && !rulesError) {
    for (const rule of policyRules) {
      const policy = rule.security_policies as Record<string, unknown>;
      if (policy?.tenant_id === tenantId && policy?.is_active && rule.target) {
        blockedWebsites.push({ domain_pattern: rule.target, reason: 'Security policy rule' });
      }
    }
  }

  // Deduplicate
  const seen = new Set<string>();
  const uniqueBlocked = blockedWebsites.filter(s => {
    if (seen.has(s.domain_pattern)) return false;
    seen.add(s.domain_pattern);
    return true;
  });

  return {
    success: true,
    blocked_websites: uniqueBlocked,
    blocked_domains: uniqueBlocked.map(s => s.domain_pattern),
    count: uniqueBlocked.length,
    synced_at: new Date().toISOString(),
  };
}, {
  hmacVerify: true,
  extraAgentFields: ['status'],
});
