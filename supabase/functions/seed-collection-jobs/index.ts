/**
 * seed-collection-jobs Edge Function
 * 
 * Cria jobs de coleta recorrentes para agentes ativos.
 * Este é o "motor de ignição" que garante que o sistema de jobs
 * tenha trabalho para processar.
 * 
 * Tipos de coleta criados:
 * - collect_antivirus_status (a cada 6h)
 * - software_inventory_collect (a cada 12h)
 * - collect_network_info (a cada 6h)
 * - collect_certificates (a cada 6h)
 * - collect_disk_metrics (a cada 6h)
 * - service_health_check (a cada 4h)
 * - light_vuln_scan (a cada 24h)
 * 
 * Segurança: Usa create_job_if_not_exists para deduplicação.
 * Performance: Só processa agentes ativos com heartbeat < 2h.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

interface CollectionJobTemplate {
  type: string;
  priority: number;
  ttl_hours: number;
  payload: Record<string, unknown>;
}

const COLLECTION_TEMPLATES: CollectionJobTemplate[] = [
  {
    type: 'collect_antivirus_status',
    priority: 5,
    ttl_hours: 1,
    payload: { source: 'auto-seed' },
  },
  {
    type: 'software_inventory_collect',
    priority: 3,
    ttl_hours: 2,
    payload: { source: 'auto-seed' },
  },
  {
    type: 'collect_network_info',
    priority: 4,
    ttl_hours: 1,
    payload: { source: 'auto-seed' },
  },
  {
    type: 'service_health_check',
    priority: 4,
    ttl_hours: 1,
    payload: { source: 'auto-seed' },
  },
  {
    type: 'light_vuln_scan',
    priority: 6,
    ttl_hours: 2,
    payload: { source: 'auto-seed', scan_level: 'light' },
  },
  {
    type: 'collect_certificates',
    priority: 3,
    ttl_hours: 1,
    payload: { source: 'auto-seed' },
  },
  // collect_disk_metrics REMOVED: disk metrics are collected via heartbeat (push model), not jobs
  {
    type: 'collect_web_activity',
    priority: 3,
    ttl_hours: 2,
    payload: { source: 'auto-seed', max_domains: 500 },
  },
  {
    type: 'collect_backup_status',
    priority: 3,
    ttl_hours: 2,
    payload: { source: 'auto-seed' },
  },
  {
    type: 'collect_process_lineage',
    priority: 4,
    ttl_hours: 2,
    payload: { source: 'auto-seed' },
  },
];

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1104: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    console.log(`[${requestId}] [seed-collection-jobs] Starting`);

    // Get active agents with recent heartbeat (< 2 hours)
    const twoHoursAgo = new Date(Date.now() - 2 * 60 * 60 * 1000).toISOString();

    const { data: activeAgents, error: agentsError } = await supabase
      .from('agents')
      .select('id, agent_name, tenant_id, status, scheduling_paused, last_heartbeat')
      .eq('status', 'active')
      .eq('scheduling_paused', false)
      .gte('last_heartbeat', twoHoursAgo);

    if (agentsError) {
      throw new Error(`Failed to fetch agents: ${agentsError.message}`);
    }

    if (!activeAgents || activeAgents.length === 0) {
      console.log(`[${requestId}] No active agents with recent heartbeat`);
      return new Response(
        JSON.stringify({ success: true, message: 'No active agents', jobs_created: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] Found ${activeAgents.length} active agents`);

    let totalCreated = 0;
    let totalSkipped = 0;
    const agentResults: Array<{ agent: string; created: number; skipped: number }> = [];

    for (const agent of activeAgents) {
      let created = 0;
      let skipped = 0;

      for (const template of COLLECTION_TEMPLATES) {
        try {
          const { data: jobId, error: createError } = await supabase.rpc(
            'create_job_if_not_exists',
            {
              p_agent_id: agent.id,
              p_tenant_id: agent.tenant_id,
              p_type: template.type,
              p_payload: template.payload,
              p_priority: template.priority,
              p_ttl_hours: template.ttl_hours,
            }
          );

          if (createError) {
            console.error(`[${requestId}] Error creating ${template.type} for ${agent.agent_name}:`, createError.message);
            skipped++;
            continue;
          }

          if (jobId) {
            created++;
            console.log(`[${requestId}] Created ${template.type} job ${jobId} for ${agent.agent_name}`);
          } else {
            skipped++; // Already exists (dedup)
          }
        } catch (err) {
          console.error(`[${requestId}] Exception creating ${template.type} for ${agent.agent_name}:`, err);
          skipped++;
        }
      }

      totalCreated += created;
      totalSkipped += skipped;
      agentResults.push({ agent: agent.agent_name, created, skipped });
    }

    const durationMs = Date.now() - startedAt;
    const result = {
      success: true,
      agents_processed: activeAgents.length,
      jobs_created: totalCreated,
      jobs_skipped_dedup: totalSkipped,
      agent_details: agentResults,
      duration_ms: durationMs,
    };

    console.log(`[${requestId}] [seed-collection-jobs] Done:`, JSON.stringify(result));

    // Report cron health
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'seed-collection-jobs',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: result,
        p_processed_count: totalCreated,
        p_job_source: 'cron',
      });
    } catch (e) { console.warn('[seed-collection-jobs] Failed to log job run:', e); }

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] [seed-collection-jobs] Fatal:`, errorMsg);

    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
