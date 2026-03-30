/**
 * Handler: Cleanup Stale Updates
 * Clears force_update flags that exceeded delivery count or time thresholds.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

export async function handleCleanupStaleUpdates(supabase: SupabaseClient, requestId: string) {
  const MAX_DELIVERY_COUNT = 10;
  const MAX_STALE_HOURS = 168;
  const staleThreshold = new Date(Date.now() - MAX_STALE_HOURS * 60 * 60 * 1000).toISOString();

  const { data: staleByTime, error: err1 } = await supabase
    .from('agents')
    .select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id')
    .not('force_update_version', 'is', null)
    .lt('force_update_at', staleThreshold);

  const { data: staleByCount, error: err2 } = await supabase
    .from('agents')
    .select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id')
    .not('force_update_version', 'is', null)
    .gte('force_update_delivery_count', MAX_DELIVERY_COUNT);

  if (err1 || err2) logger.error(`[${requestId}] [cleanup:stale-updates] Query errors:`, err1, err2);

  const allStale = new Map<string, Record<string, unknown>>();
  for (const agent of [...(staleByTime || []), ...(staleByCount || [])]) {
    allStale.set(agent.id, agent);
  }

  const staleAgents = Array.from(allStale.values()).filter(agent => {
    if (agent.force_update_reason === 'auto_retrigger_72h_offline' && (agent.force_update_delivery_count as number || 0) === 0) {
      return false;
    }
    return true;
  });

  if (staleAgents.length === 0) {
    return { message: 'No stale updates found', cleaned: 0 };
  }

  let cleaned = 0;
  for (const agent of staleAgents) {
    const reason = ((agent.force_update_delivery_count as number) || 0) >= MAX_DELIVERY_COUNT
      ? `Loop detected: ${agent.force_update_delivery_count} deliveries without confirmation`
      : `Stale: force_update_at ${agent.force_update_at} exceeds ${MAX_STALE_HOURS}h threshold`;

    const { error: updateErr } = await supabase
      .from('agents')
      .update({ force_update_version: null, force_update_reason: null, force_update_at: null, force_update_delivery_count: 0 })
      .eq('id', agent.id);

    if (updateErr) { logger.error(`[${requestId}] Failed to clean ${agent.agent_name}:`, updateErr); continue; }

    await supabase.from('agent_evidence_logs').insert({
      agent_id: agent.id,
      agent_name: agent.agent_name,
      agent_version: agent.agent_version,
      tenant_id: agent.tenant_id,
      event_type: 'force_update_auto_cancelled',
      event_data: { cancelled_version: agent.force_update_version, reason, original_trigger: agent.force_update_reason, delivery_count: agent.force_update_delivery_count || 0, force_update_at: agent.force_update_at, cleaned_at: new Date().toISOString() },
      evidence_hash: crypto.randomUUID(),
      severity: 'warn',
    });

    cleaned++;
  }

  return { success: true, cleaned, total_stale: staleAgents.length, agents: staleAgents.map(a => ({ name: a.agent_name, stuck_version: a.force_update_version, delivery_count: a.force_update_delivery_count, trigger_reason: a.force_update_reason })) };
}
