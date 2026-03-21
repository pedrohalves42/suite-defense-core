import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { shouldProcessAlertsForTenant } from '../_shared/business-hours.ts';
import { sendWebhookAlert, type WebhookPayload } from '../_shared/webhook-utils.ts';

const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

Deno.serve(async (req) => {
  // Accept either internal secret OR valid JWT (for cron jobs)
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
  const providedSecret = req.headers.get('X-Internal-Secret');
  const authHeader = req.headers.get('Authorization');

  // Allow if internal secret matches OR if it's an authorized JWT call (cron jobs)
  const hasValidSecret = providedSecret === INTERNAL_SECRET;
  const hasJWT = authHeader && authHeader.startsWith('Bearer ');
  
  if (!hasValidSecret && !hasJWT) {
    console.error('[Monitor] Unauthorized access attempt');
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const supabase = createClient(supabaseUrl, supabaseServiceKey);
  const startedAt = Date.now();

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
    const skippedAgents = [];

    // Cache de verificação de horário por tenant para evitar queries repetidas
    const tenantBusinessHoursCache: Record<string, { shouldProcess: boolean; reason: string }> = {};

    for (const agent of agents || []) {
      if (!agent.last_heartbeat) continue;

      const lastHeartbeat = new Date(agent.last_heartbeat);
      const minutesSinceHeartbeat = (now.getTime() - lastHeartbeat.getTime()) / (1000 * 60);

      // Agent offline for more than 10 minutes (aligned with get_agent_health_metrics RPC)
      if (minutesSinceHeartbeat > 10) {
        // Verificar horário de expediente do tenant (com cache)
        if (!tenantBusinessHoursCache[agent.tenant_id]) {
          tenantBusinessHoursCache[agent.tenant_id] = await shouldProcessAlertsForTenant(supabase, agent.tenant_id);
        }
        
        const { shouldProcess, reason } = tenantBusinessHoursCache[agent.tenant_id];
        
        if (!shouldProcess) {
          skippedAgents.push({
            agent_name: agent.agent_name,
            minutesOffline: Math.floor(minutesSinceHeartbeat),
            reason
          });
          console.log(`[Monitor] Skipping offline check for ${agent.agent_name} - ${reason}`);
          continue;
        }

        offlineAgents.push({
          ...agent,
          minutesOffline: Math.floor(minutesSinceHeartbeat)
        });

        // CRITICAL FIX: NÃO alterar agents.status para 'offline'
        // Em vez disso, apenas registrar offline_detected_at e offline_reason
        // Isso evita que agentes "desapareçam" das listas que filtram por status='active'
        const alreadyMarkedOffline = agent.offline_detected_at !== null;
        
        if (!alreadyMarkedOffline) {
          await supabase
            .from('agents')
            .update({ 
              offline_detected_at: new Date().toISOString(),
              offline_reason: `Sem heartbeat há ${Math.floor(minutesSinceHeartbeat)} minutos`
            })
            .eq('id', agent.id);
          
          console.log(`[Monitor] Agent ${agent.agent_name} marked as offline (detected_at set) - ${Math.floor(minutesSinceHeartbeat)} minutes`);
        } else {
          console.log(`[Monitor] Agent ${agent.agent_name} still offline - ${Math.floor(minutesSinceHeartbeat)} minutes`);
        }
      } else if (agent.offline_detected_at !== null) {
        // Agent voltou a responder - limpar flags de offline
        await supabase
          .from('agents')
          .update({ 
            offline_detected_at: null,
            offline_reason: null
          })
          .eq('id', agent.id);
        
        console.log(`[Monitor] Agent ${agent.agent_name} is back online`);
      }
    }

    // Send alerts for offline agents
    if (offlineAgents.length > 0) {
      for (const agent of offlineAgents) {
        const { data: settings } = await supabase
          .from('tenant_settings')
          .select('*')
          .eq('tenant_id', agent.tenant_id)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Send email alert via notification-dispatcher (consolidated from send-alert-email)
        if (settings?.enable_email_alerts && settings?.alert_email) {
          await supabase.functions.invoke('notification-dispatcher', {
            headers: {
              'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
            },
            body: {
              channel: 'email',
              type: 'health',
              severity: 'warning',
              tenant_id: agent.tenant_id,
              recipients: [settings.alert_email],
              subject: `[WARN] Agente Offline: ${agent.agent_name}`,
              message: `Agente ${agent.agent_name} está offline há ${agent.minutesOffline} minutos.`,
              agent_name: agent.agent_name,
              metadata: {
                agentName: agent.agent_name,
                minutesOffline: agent.minutesOffline,
                lastHeartbeat: agent.last_heartbeat
              }
            }
          });
        }

        // Send webhook alert if enabled (Slack, Teams, or generic)
        if (settings?.enable_webhook_alerts && settings?.alert_webhook_url) {
          const webhookPayload: WebhookPayload = {
            tenantId: agent.tenant_id,
            alertType: 'agent_offline',
            agentName: agent.agent_name,
            timestamp: new Date().toISOString(),
            data: {
              minutesOffline: agent.minutesOffline,
              lastHeartbeat: agent.last_heartbeat
            }
          };

          const webhookResult = await sendWebhookAlert(settings.alert_webhook_url, webhookPayload);
          
          if (webhookResult.success) {
            console.log(`[Monitor] Webhook alert sent for ${agent.agent_name} - ${webhookResult.statusCode}`);
          } else {
            console.error(`[Monitor] Webhook alert failed for ${agent.agent_name}: ${webhookResult.error}`);
          }
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

    // Send alerts for failed jobs (respeitando horário de expediente)
    if (failedJobs && failedJobs.length > 0) {
      const jobsByTenant = failedJobs.reduce((acc, job) => {
        if (!acc[job.tenant_id]) acc[job.tenant_id] = [];
        acc[job.tenant_id].push(job);
        return acc;
      }, {} as Record<string, any[]>);

      for (const [tenantId, jobs] of Object.entries(jobsByTenant) as [string, any[]][]) {
        // Verificar horário de expediente do tenant
        if (!tenantBusinessHoursCache[tenantId]) {
          tenantBusinessHoursCache[tenantId] = await shouldProcessAlertsForTenant(supabase, tenantId);
        }
        
        const { shouldProcess, reason } = tenantBusinessHoursCache[tenantId];
        
        if (!shouldProcess) {
          console.log(`[Monitor] Skipping failed jobs alert for tenant ${tenantId} - ${reason}`);
          continue;
        }

        const { data: settings } = await supabase
          .from('tenant_settings')
          .select('*')
          .eq('tenant_id', tenantId)
          .order('updated_at', { ascending: false })
          .limit(1)
          .maybeSingle();

        // Send email alert via notification-dispatcher (consolidated from send-alert-email)
        if (settings?.enable_email_alerts && settings?.alert_email) {
          await supabase.functions.invoke('notification-dispatcher', {
            headers: {
              'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
            },
            body: {
              channel: 'email',
              type: 'alert',
              severity: 'critical',
              tenant_id: tenantId,
              recipients: [settings.alert_email],
              subject: `[ERROR] ${jobs.length} Job(s) Falharam`,
              message: `${jobs.length} job(s) falharam e precisam de atenção.`,
              metadata: {
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

        // Send webhook alert if enabled (Slack, Teams, or generic)
        if (settings?.enable_webhook_alerts && settings?.alert_webhook_url) {
          const webhookPayload: WebhookPayload = {
            tenantId,
            alertType: 'jobs_failed',
            timestamp: new Date().toISOString(),
            data: {
              failedCount: jobs.length,
              jobs: jobs.map((j: any) => ({
                id: j.id,
                type: j.type,
                agentName: j.agent_name
              }))
            }
          };

          const webhookResult = await sendWebhookAlert(settings.alert_webhook_url, webhookPayload);
          
          if (webhookResult.success) {
            console.log(`[Monitor] Webhook alert sent for failed jobs (tenant: ${tenantId}) - ${webhookResult.statusCode}`);
          } else {
            console.error(`[Monitor] Webhook alert failed for tenant ${tenantId}: ${webhookResult.error}`);
          }
        }
      }
    }

    const result = {
      success: true,
      offlineAgents: offlineAgents.length,
      skippedAgents: skippedAgents.length,
      failedJobs: failedJobs?.length || 0
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'monitor-agent-health',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: (agents?.length || 0),
      p_job_source: 'cron'
    });

    // Report to cron health monitoring
    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'monitor-agent-health-every-5min',
        p_success: true,
        p_error: null
      });
    } catch (e) { console.warn('[monitor-agent-health] Failed to update cron health:', e); }

    return new Response(
      JSON.stringify(result),
      { headers: { 'Content-Type': 'application/json' } }
    );
  } catch (error: any) {
    console.error('[Monitor] Error:', error);
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'monitor-agent-health',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error.message,
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'monitor-agent-health-every-5min',
        p_success: false,
        p_error: error.message
      });
    } catch (e) { console.warn('[monitor-agent-health] Failed to log error run:', e); }
    
    return new Response(
      JSON.stringify({ error: error.message }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }
});
