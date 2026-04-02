/**
 * create-honeypot-pool — Maintains a fixed pool of native honeypot agents per tenant.
 * 
 * Via serveInternal (cron).
 * 
 * Rules:
 * - Fixed pool size per tenant (default: 2)
 * - NO token/HMAC for native honeypots (they don't need to authenticate)
 * - NO agent_tokens entries for native honeypots
 * - hmac_secret is NULL (not empty string)
 * - Recycles only when below target pool size
 * - Never creates infinitely
 */

import { serveInternal } from '../_shared/serve-internal.ts';

const HONEYPOT_NAMES = [
  'WKS-FINANCE-01', 'SRV-BACKUP-02', 'DC-SECONDARY-01',
  'WKS-HR-03', 'SRV-FILE-01', 'WKS-DEV-05',
  'SRV-PRINT-01', 'WKS-EXEC-02', 'SRV-WEB-03',
  'WKS-RECEPTION-01', 'SRV-DB-STANDBY', 'WKS-IT-SPARE',
];

/** Default pool size per tenant */
const DEFAULT_POOL_SIZE = 2;

serveInternal(async (_req, { supabase, requestId, body }) => {
  const params = body as {
    tenant_id?: string;
    pool_size?: number;
  };

  // Get tenants
  let tenantIds: string[] = [];

  if (params.tenant_id) {
    tenantIds = [params.tenant_id];
  } else {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id')
      .limit(100);
    tenantIds = (tenants || []).map((t: { id: string }) => t.id);
  }

  const poolSize = params.pool_size || DEFAULT_POOL_SIZE;
  const results: Array<{ tenant_id: string; existing: number; created: number }> = [];

  for (const tenantId of tenantIds) {
    // Count existing native honeypots
    const { count: existing } = await supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('honeypot_mode', 'native');

    const needed = Math.max(0, poolSize - (existing || 0));
    if (needed === 0) {
      results.push({ tenant_id: tenantId, existing: existing || 0, created: 0 });
      continue;
    }

    let created = 0;
    for (let i = 0; i < needed; i++) {
      const name = HONEYPOT_NAMES[Math.floor(Math.random() * HONEYPOT_NAMES.length)] +
        '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

      // Create agent WITHOUT token or HMAC secret (native doesn't authenticate)
      // hmac_secret is NULL — not empty string
      const { error: agentError } = await supabase
        .from('agents')
        .insert({
          tenant_id: tenantId,
          agent_name: name,
          hostname: name,
          os_type: Math.random() > 0.3 ? 'windows' : 'linux',
          status: 'active',
          honeypot_mode: 'native',
          honeypot_activated_at: new Date().toISOString(),
          honeypot_reason: 'Pool-seeded native honeypot',
          // hmac_secret intentionally omitted — NULL, not empty string
          last_honeypot_state_change_at: new Date().toISOString(),
        });

      if (agentError) {
        console.error(`[create-honeypot-pool] Failed: ${agentError.message}`);
        continue;
      }

      // NO token creation for native honeypots
      created++;
    }

    results.push({ tenant_id: tenantId, existing: existing || 0, created });
  }

  return {
    success: true,
    request_id: requestId,
    pool_size: poolSize,
    results,
    total_created: results.reduce((sum, r) => sum + r.created, 0),
  };
});
