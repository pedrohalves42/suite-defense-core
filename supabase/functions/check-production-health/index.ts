import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';

/**
 * Check Production Health
 * 
 * Monitora a saúde do sistema e cria alertas automáticos para:
 * - Falta de heartbeats recentes (última hora)
 * - Alta taxa de falha de instalação (>30% em 24h)
 * - Jobs em fila acumulando (>100 há mais de 30min)
 * 
 * Executado via cron job a cada hora
 */
Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

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
    // ✅ CHECK 1: Heartbeats recentes
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
          title: 'Nenhum heartbeat de agentes na última hora',
          message: `${activeAgentsCount} agente(s) ativo(s) mas nenhum heartbeat recente detectado.`,
          details: {
            last_check: now.toISOString(),
            active_agents_count: activeAgentsCount,
            threshold_minutes: 60
          }
        });
        console.log('[check-production-health] ⚠️ No recent heartbeats detected');
      }
    } else {
      console.log(`[check-production-health] ✅ ${recentHeartbeats.length} agents with recent heartbeats`);
    }

    // ✅ CHECK 2: Taxa de falha de instalação
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
          title: `Alta taxa de falha de instalação: ${(failureRate * 100).toFixed(1)}%`,
          message: `${failureCount} de ${installations.length} instalações falharam nas últimas 24 horas (threshold: 30%)`,
          details: {
            failure_rate: failureRate,
            failed_count: failureCount,
            total_count: installations.length,
            threshold_pct: 30,
            period_hours: 24
          }
        });
        console.log('[check-production-health] ⚠️ High installation failure rate detected');
      }
    } else {
      console.log(`[check-production-health] ✅ Installation sample too small (${installations?.length || 0} < 10)`);
    }

    // ✅ CHECK 3: Jobs em fila acumulando
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
        title: `${queuedJobsCount} jobs em fila há mais de 30 minutos`,
        message: 'Jobs não estão sendo processados. Verifique a saúde dos agentes e a conectividade.',
        details: {
          queued_count: queuedJobsCount,
          threshold_count: 100,
          age_minutes: 30
        }
      });
      console.log('[check-production-health] ⚠️ Too many stuck jobs in queue');
    } else {
      console.log(`[check-production-health] ✅ Queued jobs within normal range (${queuedJobsCount || 0})`);
    }

    // ✅ Inserir alertas no banco
    if (alerts.length > 0) {
      console.log(`[check-production-health] Creating ${alerts.length} alert(s)`);
      
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
        }
      }
    }

    console.log('[check-production-health] Health check completed');

    return new Response(
      JSON.stringify({
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
      }),
      { 
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' }
      }
    );

  } catch (error: any) {
    console.error('[check-production-health] Unexpected error:', error);
    
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
