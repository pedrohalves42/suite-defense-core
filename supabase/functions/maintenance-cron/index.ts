import { serve } from "https://deno.land/std@0.168.0/http/server.ts"
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2'
import { corsHeaders } from "../_shared/cors.ts"

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const startedAt = Date.now();

  try {
    const now = new Date();
    let expiredJobsProcessed = 0;
    let offlineAgentsProcessed = 0;
    let archivedExecutions = 0;

    // 1. Expire jobs past TTL (4h default)
    const { data: expiredJobs } = await supabase
      .from('jobs')
      .select('id')
      .in('status', ['pending', 'queued', 'delivered', 'running'])
      .lt('expires_at', now.toISOString())
      .limit(500);

    if (expiredJobs && expiredJobs.length > 0) {
      const ids = expiredJobs.map(j => j.id);
      const { error } = await supabase
        .from('jobs')
        .update({ status: 'timeout', updated_at: now.toISOString() })
        .in('id', ids);

      if (!error) {
        expiredJobsProcessed = ids.length;
        console.log(`[maintenance-cron] Expired ${ids.length} jobs past TTL`);
      }
    }

    // 2. Mark agents offline (no heartbeat for 5+ min)
    const offlineThreshold = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: offlineAgents } = await supabase
      .from('agents')
      .select('id')
      .eq('status', 'active')
      .lt('last_seen', offlineThreshold)
      .limit(500);

    if (offlineAgents && offlineAgents.length > 0) {
      const ids = offlineAgents.map(a => a.id);
      const { error } = await supabase
        .from('agents')
        .update({ status: 'inactive', updated_at: now.toISOString() })
        .in('id', ids);

      if (!error) {
        offlineAgentsProcessed = ids.length;
        console.log(`[maintenance-cron] Marked ${ids.length} agents inactive`);
      }
    }

    // 3. Archive old executions (mark for soft-delete after 30 days)
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: oldExecutions } = await supabase
      .from('job_executions')
      .select('id')
      .is('archived_at', null)
      .lt('created_at', thirtyDaysAgo)
      .limit(1000);

    if (oldExecutions && oldExecutions.length > 0) {
      const ids = oldExecutions.map(e => e.id);
      const { error } = await supabase
        .from('job_executions')
        .update({ archived_at: now.toISOString() })
        .in('id', ids);

      if (!error) {
        archivedExecutions = ids.length;
        console.log(`[maintenance-cron] Archived ${ids.length} old executions`);
      }
    }

    // 4. Report health
    const durationMs = Date.now() - startedAt;
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'maintenance-cron',
        p_success: true,
        p_details: {
          expired_jobs_processed: expiredJobsProcessed,
          offline_agents_processed: offlineAgentsProcessed,
          archived_executions: archivedExecutions,
          duration_ms: durationMs,
        }
      });
    } catch (healthErr) {
      console.warn('[maintenance-cron] Failed to update cron health:', healthErr);
    }

    return new Response(JSON.stringify({
      success: true,
      expired_jobs_processed: expiredJobsProcessed,
      offline_agents_processed: offlineAgentsProcessed,
      archived_executions: archivedExecutions,
      duration_ms: durationMs,
    }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const err = error as Error;
    console.error('[maintenance-cron] Fatal error:', err.message);

    try {
      await supabase.rpc('mark_cron_failure', {
        p_cron_name: 'maintenance-cron',
        p_error: err.message,
      });
    } catch (_) { /* best effort */ }

    return new Response(JSON.stringify({
      success: false,
      error: err.message,
    }), {
      status: 500,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
