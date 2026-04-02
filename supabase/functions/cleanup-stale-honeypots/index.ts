/**
 * cleanup-stale-honeypots — Cron function to deactivate/remove stale honeypots.
 * 
 * Via serveInternal (cron).
 * - Deactivates native honeypots with no interaction in 30+ days
 * - Cleans up old rate limit buckets and expired blocks
 * - Cleans up old honeypot_interactions (>30 days default)
 */

import { serveInternal } from '../_shared/serve-internal.ts';

serveInternal(async (_req, { supabase, requestId }) => {
  const results = {
    stale_honeypots_deactivated: 0,
    rate_data_cleaned: 0,
    old_interactions_cleaned: 0,
  };

  // 1. Deactivate native honeypots with no interaction in 30+ days
  const thirtyDaysAgo = new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString();

  const { data: staleAgents } = await supabase
    .from('agents')
    .select('id')
    .eq('honeypot_mode', 'native')
    .or(`last_honeypot_interaction_at.is.null,last_honeypot_interaction_at.lt.${thirtyDaysAgo}`)
    .lt('honeypot_activated_at', thirtyDaysAgo);

  if (staleAgents && staleAgents.length > 0) {
    const ids = staleAgents.map((a: { id: string }) => a.id);

    const { count } = await supabase
      .from('agents')
      .update({
        honeypot_mode: 'none',
        status: 'inactive',
        last_honeypot_state_change_at: new Date().toISOString(),
      })
      .in('id', ids);

    results.stale_honeypots_deactivated = count || staleAgents.length;
  }

  // 2. Cleanup old rate limit data (buckets > 10 min, expired blocks)
  const { data: cleanedRL } = await supabase.rpc('cleanup_honeypot_rate_data', {
    p_older_than_minutes: 10,
  });
  results.rate_data_cleaned = cleanedRL || 0;

  // 3. Cleanup old interactions (>30 days default)
  const retentionDays = 30;
  const cutoff = new Date(Date.now() - retentionDays * 24 * 60 * 60 * 1000).toISOString();

  const { count: deletedInteractions } = await supabase
    .from('honeypot_interactions')
    .delete()
    .lt('created_at', cutoff);

  results.old_interactions_cleaned = deletedInteractions || 0;

  console.log(`[cleanup-stale-honeypots] Results:`, results);

  return {
    success: true,
    request_id: requestId,
    ...results,
  };
});
