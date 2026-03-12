import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

/**
 * cleanup-stale-updates
 * 
 * Auto-cancels force_update flags stuck for >168h (7 days) OR delivered >10 times
 * without confirmation. This prevents infinite update loops.
 * 
 * Auth: Internal or service-role only.
 */

const MAX_DELIVERY_COUNT = 10;
const MAX_STALE_HOURS = 168; // 7 days

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // V-1118: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const staleThreshold = new Date(Date.now() - MAX_STALE_HOURS * 60 * 60 * 1000).toISOString();

    // Case 1: force_update_at is too old (>7 days)
    const { data: staleByTime, error: err1 } = await supabase
      .from('agents')
      .select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id')
      .not('force_update_version', 'is', null)
      .lt('force_update_at', staleThreshold);

    // Case 2: too many deliveries without confirmation (>10)
    const { data: staleByCount, error: err2 } = await supabase
      .from('agents')
      .select('id, agent_name, agent_version, force_update_version, force_update_at, force_update_delivery_count, force_update_reason, tenant_id')
      .not('force_update_version', 'is', null)
      .gte('force_update_delivery_count', MAX_DELIVERY_COUNT);

    if (err1 || err2) {
      console.error(`[${requestId}] Query errors:`, err1, err2);
    }

    // Merge and deduplicate
    const allStale = new Map<string, any>();
    for (const agent of [...(staleByTime || []), ...(staleByCount || [])]) {
      allStale.set(agent.id, agent);
    }

    // Filter out agents that were recently re-triggered but never delivered yet
    // These are offline agents waiting to come back - don't clear their flags
    const staleAgents = Array.from(allStale.values()).filter(agent => {
      if (
        agent.force_update_reason === 'auto_retrigger_72h_offline' &&
        (agent.force_update_delivery_count || 0) === 0
      ) {
        console.log(`[${requestId}] Skipping ${agent.agent_name}: re-triggered but not yet delivered (waiting for agent to come online)`);
        return false;
      }
      return true;
    });

    if (staleAgents.length === 0) {
      return new Response(JSON.stringify({ 
        message: 'No stale updates found', cleaned: 0 
      }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
    }

    console.log(`[${requestId}] Found ${staleAgents.length} agents with stale force_update flags`);

    let cleaned = 0;
    for (const agent of staleAgents) {
      const reason = (agent.force_update_delivery_count || 0) >= MAX_DELIVERY_COUNT
        ? `Loop detected: ${agent.force_update_delivery_count} deliveries without confirmation`
        : `Stale: force_update_at ${agent.force_update_at} exceeds ${MAX_STALE_HOURS}h threshold`;

      console.log(`[${requestId}] Cleaning: ${agent.agent_name} (${agent.force_update_version}) - ${reason}`);

      // Clear force_update flags
      const { error: updateErr } = await supabase
        .from('agents')
        .update({
          force_update_version: null,
          force_update_reason: null,
          force_update_at: null,
          force_update_delivery_count: 0
        })
        .eq('id', agent.id);

      if (updateErr) {
        console.error(`[${requestId}] Failed to clean ${agent.agent_name}:`, updateErr);
        continue;
      }

      // Log evidence (tenant_id already in select, no N+1 query)
      await supabase.from('agent_evidence_logs').insert({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        agent_version: agent.agent_version,
        tenant_id: agent.tenant_id,
        event_type: 'force_update_auto_cancelled',
        event_data: {
          cancelled_version: agent.force_update_version,
          reason,
          original_trigger: agent.force_update_reason,
          delivery_count: agent.force_update_delivery_count || 0,
          force_update_at: agent.force_update_at,
          cleaned_at: new Date().toISOString()
        },
        evidence_hash: crypto.randomUUID(),
        severity: 'warn'
      });

      cleaned++;
    }

    console.log(`[${requestId}] Cleanup complete: ${cleaned}/${staleAgents.length} agents cleaned`);

    return new Response(JSON.stringify({
      success: true,
      cleaned,
      total_stale: staleAgents.length,
      agents: staleAgents.map(a => ({
        name: a.agent_name,
        stuck_version: a.force_update_version,
        delivery_count: a.force_update_delivery_count,
        trigger_reason: a.force_update_reason
      }))
    }), { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });

  } catch (error) {
    console.error(`[${requestId}] Error:`, (error as Error).message);
    return new Response(JSON.stringify({ error: (error as Error).message }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' }
    });
  }
});
