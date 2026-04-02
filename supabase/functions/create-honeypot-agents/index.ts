/**
 * create-honeypot-agents — Cron function to seed native honeypot agents.
 * 
 * Via serveInternal (cron).
 * Creates fake agents with honeypot_mode = 'native' and valid tokens.
 * These agents don't exist on real machines — they're decoys.
 */

import { serveInternal } from '../_shared/serve-internal.ts';
import { hashToken } from '../_shared/token-hash.ts';

const HONEYPOT_NAMES = [
  'WKS-FINANCE-01', 'SRV-BACKUP-02', 'DC-SECONDARY-01',
  'WKS-HR-03', 'SRV-FILE-01', 'WKS-DEV-05',
  'SRV-PRINT-01', 'WKS-EXEC-02', 'SRV-WEB-03',
  'WKS-RECEPTION-01', 'SRV-DB-STANDBY', 'WKS-IT-SPARE',
];

serveInternal(async (_req, { supabase, requestId }) => {
  const body = (_req.method === 'POST' ? await _req.json().catch(() => ({})) : {}) as {
    tenant_id?: string;
    count?: number;
  };

  // Get tenants that need honeypots
  let tenantIds: string[] = [];

  if (body.tenant_id) {
    tenantIds = [body.tenant_id];
  } else {
    // Get all active tenants
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id')
      .eq('status', 'active')
      .limit(100);
    tenantIds = (tenants || []).map((t: { id: string }) => t.id);
  }

  const count = body.count || 2; // Create 2 honeypots per tenant by default
  const results: Array<{ tenant_id: string; agents_created: number }> = [];

  for (const tenantId of tenantIds) {
    // Check how many native honeypots already exist for this tenant
    const { count: existing } = await supabase
      .from('agents')
      .select('id', { count: 'exact', head: true })
      .eq('tenant_id', tenantId)
      .eq('honeypot_mode', 'native');

    const needed = Math.max(0, count - (existing || 0));
    if (needed === 0) {
      results.push({ tenant_id: tenantId, agents_created: 0 });
      continue;
    }

    let created = 0;
    for (let i = 0; i < needed; i++) {
      const name = HONEYPOT_NAMES[Math.floor(Math.random() * HONEYPOT_NAMES.length)] +
        '-' + Math.random().toString(36).substring(2, 6).toUpperCase();

      // Generate HMAC secret
      const hmacSecret = crypto.randomUUID();

      // Create the agent
      const { data: agent, error: agentError } = await supabase
        .from('agents')
        .insert({
          tenant_id: tenantId,
          agent_name: name,
          hostname: name,
          os_type: Math.random() > 0.3 ? 'windows' : 'linux',
          status: 'active',
          honeypot_mode: 'native',
          honeypot_activated_at: new Date().toISOString(),
          honeypot_reason: 'Auto-seeded native honeypot',
          hmac_secret: hmacSecret,
        })
        .select('id')
        .single();

      if (agentError || !agent) {
        console.error(`[create-honeypot-agents] Failed to create agent: ${agentError?.message}`);
        continue;
      }

      // Create a token for the agent
      const token = crypto.randomUUID() + '-' + crypto.randomUUID();
      const tokenHash = await hashToken(token);

      await supabase.from('agent_tokens').insert({
        agent_id: agent.id,
        token_hash: tokenHash,
        token_prefix: token.substring(0, 8),
        is_active: true,
        tenant_id: tenantId,
        expires_at: new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString(),
      });

      created++;
    }

    results.push({ tenant_id: tenantId, agents_created: created });
  }

  return {
    success: true,
    request_id: requestId,
    results,
    total_created: results.reduce((sum, r) => sum + r.agents_created, 0),
  };
});
