import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Validate internal secret
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');

  if (providedSecret !== INTERNAL_SECRET) {
    console.error('[Monitor] Unauthorized access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);

  try {
    console.log('[Monitor] Checking agent health...');

    // Get all agents and their last heartbeat
    const { data: agents, error: agentsError } = await supabase
      .from('agents')
      .select('*')
      .eq('status', 'active');

    if (agentsError) throw agentsError;

    const now = new Date();
    const offlineAgents = [];

    for (const agent of agents || []) {
      if (!agent.last_heartbeat) continue;

      const lastHeartbeat = new Date(agent.last_heartbeat);
      const minutesSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60);

      // Agent offline for more than 5 minutes
      if (minutesSinceHeartbeat > 5) {
        offlineAgents.push({
          ...agent,
          minutesOffline: Math.floor(minutesSinceHeartbeat)
        });

        // Update agent status to offline
        await supabase
          .from('agents')
          .update({ status: 'offline' })
          .eq('id', agent.id);

        console.log(`[Monitor] Agent ${agent.agent_name} is offline for ${Math.floor(minutesSinceHeartbeat)} minutes`);
      }
    }

    // Send alerts for offline agents
    if (offlineAgents.length > 0) {
      for (const agent of offlineAgents) {
        const { data: settings } = await supabase
          .from('tenant_settings')
          .select('*')
          .eq('tenant_id', agent.tenant_id)
          .single();

        if (settings?.enable_email_alerts && settings?.alert_email) {
          await supabase.functions.invoke('send-alert-email', {
            headers: {
              'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
            },
            body: {
              tenantId: agent.tenant_id,
              alertType: 'agent_offline',
              subject: `⚠️ Agente Offline: ${agent.agent_name}`,
              data: {
                agentName: agent.agent_name,
                minutesOffline: agent.minutesOffline,
                lastHeartbeat: agent.last_heartbeat
              }
            }
          });
        }
      }
    }

    // Check for failed jobs in last 5 minutes
    const fiveMinutesAgo = new Date(now.getTime() - 5 * 60 * 1000).toISOString();
    const { data: failedJobs, error: jobsError } = await supabase
      .from('jobs')
      .select('*')
      .eq('status', 'failed')
      .gte('created_at', fiveMinutesAgo);

    if (jobsError) throw jobsError;

    // Send alerts for failed jobs
    if (failedJobs && failedJobs.length > 0) {
      const jobsByTenant = failedJobs.reduce((acc, job) => {
        if (!acc[job.tenant_id]) acc[job.tenant_id] = [];
        acc[job.tenant_id].push(job);
        return acc;
      }, {} as Record<string, any[]>);

      for (const [tenantId, jobs] of Object.entries(jobsByTenant) as [string, any[]][]) {
        const { data: settings } = await supabase
          .from('tenant_settings')
          .select('*')
          .eq('tenant_id', tenantId)
          .single();

        if (settings?.enable_email_alerts && settings?.alert_email) {
          await supabase.functions.invoke('send-alert-email', {
            headers: {
              'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
            },
            body: {
              tenantId,
              alertType: 'jobs_failed',
              subject: `❌ ${jobs.length} Job(s) Falharam`,
              data: {
                failedCount: jobs.length,
                jobs: jobs.map((j: any) => ({
                  id: j.id,
                  type: j.type,
                  agentName: j.agent_name,
                  createdAt: j.created_at
                }))
              }
            }
          });
        }
      }
    }

    return new Response(
      JSON.stringify({
        success: true,
        offlineAgents: offlineAgents.length,
        failedJobs: failedJobs?.length || 0
      }),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Monitor] Error:', error);
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
