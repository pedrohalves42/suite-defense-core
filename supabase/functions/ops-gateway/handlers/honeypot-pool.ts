/**
 * Honeypot pool handler — maintains native honeypot agent pool.
 * Inlined from create-honeypot-pool (Phase 1B).
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const HONEYPOT_NAMES = [
  'WKS-FINANCE-01', 'SRV-BACKUP-02', 'DC-SECONDARY-01',
  'WKS-HR-03', 'SRV-FILE-01', 'WKS-DEV-05',
  'SRV-PRINT-01', 'WKS-EXEC-02', 'SRV-WEB-03',
  'WKS-RECEPTION-01', 'SRV-DB-STANDBY', 'WKS-IT-SPARE',
];

const DEFAULT_POOL_SIZE = 2;

export async function handleCreateHoneypotPool(
  supabase: ReturnType<typeof createClient>,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<unknown> {
  let tenantIds: string[] = [];

  if (payload.tenant_id) {
    tenantIds = [payload.tenant_id as string];
  } else {
    const { data: tenants } = await supabase
      .from('tenants')
      .select('id')
      .limit(100);
    tenantIds = (tenants || []).map((t: { id: string }) => t.id);
  }

  const poolSize = (payload.pool_size as number) || DEFAULT_POOL_SIZE;
  const results: Array<{ tenant_id: string; existing: number; created: number }> = [];

  for (const tenantId of tenantIds) {
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
          last_honeypot_state_change_at: new Date().toISOString(),
        });

      if (agentError) {
        console.error(`[create-honeypot-pool] Failed: ${agentError.message}`);
        continue;
      }
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
}
