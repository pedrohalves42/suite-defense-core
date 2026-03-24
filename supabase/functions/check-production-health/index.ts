import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

/**
 * Check Production Health
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  // V-1131: Defense-in-depth auth guard for cron function
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const alerts: any[] = [];
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  console.log('[check-production-health] Starting health check at', now.toISOString());

  try {
    // [OK]  CHECK 1: Heartbeats recentes
    const { data: recentHeartbeats, error: heartbeatError } = await supabase
      .from('agents')
      .select('id, agent_name, last_heartbeat')
      .gte('last_heartbeat', oneHourAgo.toISOString())
      .neq('status', 'inactive');

    if (heartbeatError) {
      console.error('[check-production-health] Error checking heartbeats:', heartbeatError);
    } else if (!recentHeartbeats || recentHeartbeats.length === 0) {
      // Verificar se existem agentes ativos/pendentes
      const { count: activeAgentsCount } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .in('status', ['active', 'pending']);

      if (activeAgentsCount && activeAgentsCount > 0) {
        alerts.push({
          tenant_id: null, // System-wide alert
          alert_type: 'no_heartbeats',
          severity: 'high',
          title: 'Nenhum heartbeat de agentes na ultima hora',
          message: `${activeAgentsCount} agente(s) ativo(s) mas nenhum heartbeat recente detectado.`,
          details: {
            last_check: now.toISOString(),
            active_agents_count: activeAgentsCount,
            threshold_minutes: 60
          }
        });
        console.log('[check-production-health] [WARN] ? No recent heartbeats detected');
      }
    } else {
      console.log(`[check-production-health] [OK]  ${recentHeartbeats.length} agents with recent heartbeats`);
    }

    // [OK]  CHECK 2: Taxa de falha de instalacao
    const { data: installations, error: installError } = await supabase
      .from('installation_analytics')
      .select('success, event_type')
      .gte('created_at', oneDayAgo.toISOString())
      .in('event_type', ['post_installation', 'post_installation_unverified']);

    if (installError) {
      console.error('[check-production-health] Error checking installations:', installError);
    } else if (installations && installations.length >= 10) {
      const failureCount = installations.filter(i => i.success === false).length;
      const failureRate = failureCount / installations.length;

      console.log(`[check-production-health] Installation stats: ${failureCount}/${installations.length} failed (${(failureRate * 100).toFixed(1)}%)`);

      if (failureRate > 0.30) {
        alerts.push({
          tenant_id: null, // System-wide alert
          alert_type: 'high_installation_failure',
          severity: 'critical',
          title: `Alta taxa de falha de instalacao: ${(failureRate * 100).toFixed(1)}%`,
          message: `${failureCount} de ${installations.length} instalacoes falharam nas ultimas 24 horas (threshold: 30%)`,
          details: {
            failure_rate: failureRate,
            failed_count: failureCount,
            total_count: installations.length,
            threshold_pct: 30,
            period_hours: 24
          }
        });
        console.log('[check-production-health] [WARN] ? High installation failure rate detected');
      }
    } else {
      console.log(`[check-production-health] [OK]  Installation sample too small (${installations?.length || 0} < 10)`);
    }

    // [OK]  CHECK 3: Jobs em fila acumulando
    const { count: queuedJobsCount, error: jobsError } = await supabase
      .from('jobs')
      .select('*', { count: 'exact', head: true })
      .eq('status', 'queued')
      .lt('created_at', thirtyMinutesAgo.toISOString());

    if (jobsError) {
      console.error('[check-production-health] Error checking queued jobs:', jobsError);
    } else if (queuedJobsCount && queuedJobsCount > 100) {
      alerts.push({
        tenant_id: null, // System-wide alert
        alert_type: 'jobs_stuck',
        severity: 'high',
        title: `${queuedJobsCount} jobs em fila ha mais de 30 minutos`,
        message: 'Jobs nao estao sendo processados. Verifique a saude dos agentes e a conectividade.',
        details: {
          queued_count: queuedJobsCount,
          threshold_count: 100,
          age_minutes: 30
        }
      });
      console.log('[check-production-health] [WARN] ? Too many stuck jobs in queue');
    } else {
      console.log(`[check-production-health] [OK]  Queued jobs within normal range (${queuedJobsCount || 0})`);
    }

    // [OK]  Inserir alertas no banco
    if (alerts.length > 0) {
      console.log(`[check-production-health] Creating ${alerts.length} alert(s)`);
      
      const criticalAlerts = [];
      
      for (const alert of alerts) {
        const { error: insertError } = await supabase
          .from('system_alerts')
          .insert({
            ...alert,
            acknowledged: false,
            created_at: now.toISOString()
          });

        if (insertError) {
          console.error('[check-production-health] Error inserting alert:', insertError);
        } else if (alert.severity === 'critical' || alert.severity === 'high') {
          criticalAlerts.push(alert);
        }
      }

      // [OK]  CORRECAO #3A: Enviar notificacoes automaticas para alertas criticos
      if (criticalAlerts.length > 0) {
        console.log(`[check-production-health] Sending notifications for ${criticalAlerts.length} critical alert(s)`);
        
        try {
          const { error: notifyError } = await supabase.functions.invoke('notification-dispatcher', {
            body: {
              event: 'production_health_check',
              severity: 'critical',
              tenant_id: null, // System-wide
              details: {
                alerts: criticalAlerts,
                timestamp: now.toISOString(),
                total_alerts: criticalAlerts.length
              }
            }
          });

          if (notifyError) {
            console.error('[check-production-health] Error sending notifications:', notifyError);
          } else {
            console.log('[check-production-health] [OK]  Notifications sent successfully');
          }
        } catch (notifyErr) {
          console.error('[check-production-health] Exception sending notifications:', notifyErr);
        }
      }
    }

    console.log('[check-production-health] Health check completed');

    const result = {
      success: true,
      checked_at: now.toISOString(),
      alerts_created: alerts.length,
      alerts: alerts.map(a => ({
        type: a.alert_type,
        severity: a.severity,
        title: a.title
      })),
      checks_performed: {
        heartbeats: !heartbeatError,
        installations: !installError,
        queued_jobs: !jobsError
      }
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'check-production-health',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: alerts.length,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify(result),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('[check-production-health] Unexpected error:', error);
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'check-production-health',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: error?.message || String(error),
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { console.warn('[check-production-health] Failed to log job run:', e); }
    
    return new Response(
      JSON.stringify({
        success: false,
        error: error?.message || String(error),
        checked_at: now.toISOString()
      }),
      { 
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );
  }
});
