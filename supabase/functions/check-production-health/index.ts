/**
 * check-production-health → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();
  const alerts: Array<Record<string, unknown>> = [];
  const now = new Date();
  const oneHourAgo = new Date(now.getTime() - 60 * 60 * 1000);
  const oneDayAgo = new Date(now.getTime() - 24 * 60 * 60 * 1000);
  const thirtyMinutesAgo = new Date(now.getTime() - 30 * 60 * 1000);

  logger.info(`[${requestId}] Starting health check at ${now.toISOString()}`);

  // CHECK 1: Heartbeats recentes
  const { data: recentHeartbeats, error: heartbeatError } = await supabase
    .from('agents').select('id, agent_name, last_heartbeat')
    .gte('last_heartbeat', oneHourAgo.toISOString()).neq('status', 'inactive');

  if (!heartbeatError && (!recentHeartbeats || recentHeartbeats.length === 0)) {
    const { count: activeAgentsCount } = await supabase.from('agents').select('*', { count: 'exact', head: true }).in('status', ['active', 'pending']);
    if (activeAgentsCount && activeAgentsCount > 0) {
      alerts.push({ tenant_id: null, alert_type: 'no_heartbeats', severity: 'high', title: 'Nenhum heartbeat de agentes na ultima hora', message: `${activeAgentsCount} agente(s) ativo(s) mas nenhum heartbeat recente detectado.`, details: { last_check: now.toISOString(), active_agents_count: activeAgentsCount, threshold_minutes: 60 } });
    }
  }

  // CHECK 2: Taxa de falha de instalacao
  const { data: installations, error: installError } = await supabase
    .from('installation_analytics').select('success, event_type')
    .gte('created_at', oneDayAgo.toISOString()).in('event_type', ['post_installation', 'post_installation_unverified']);

  if (!installError && installations && installations.length >= 10) {
    const failureCount = installations.filter(i => i.success === false).length;
    const failureRate = failureCount / installations.length;
    if (failureRate > 0.30) {
      alerts.push({ tenant_id: null, alert_type: 'high_installation_failure', severity: 'critical', title: `Alta taxa de falha de instalacao: ${(failureRate * 100).toFixed(1)}%`, message: `${failureCount} de ${installations.length} instalacoes falharam nas ultimas 24 horas`, details: { failure_rate: failureRate, failed_count: failureCount, total_count: installations.length } });
    }
  }

  // CHECK 3: Jobs em fila acumulando
  const { count: queuedJobsCount, error: jobsError } = await supabase
    .from('jobs').select('*', { count: 'exact', head: true })
    .eq('status', 'queued').lt('created_at', thirtyMinutesAgo.toISOString());

  if (!jobsError && queuedJobsCount && queuedJobsCount > 100) {
    alerts.push({ tenant_id: null, alert_type: 'jobs_stuck', severity: 'high', title: `${queuedJobsCount} jobs em fila ha mais de 30 minutos`, message: 'Jobs nao estao sendo processados.', details: { queued_count: queuedJobsCount, threshold_count: 100, age_minutes: 30 } });
  }

  // Insert alerts
  if (alerts.length > 0) {
    const criticalAlerts = [];
    for (const alert of alerts) {
      const { error: insertError } = await supabase.from('system_alerts').insert({ ...alert, acknowledged: false, created_at: now.toISOString() });
      if (!insertError && (alert.severity === 'critical' || alert.severity === 'high')) { criticalAlerts.push(alert); }
    }
    if (criticalAlerts.length > 0) {
      try {
        await supabase.functions.invoke('notification-dispatcher', {
          body: { event: 'production_health_check', severity: 'critical', tenant_id: null, details: { alerts: criticalAlerts, timestamp: now.toISOString(), total_alerts: criticalAlerts.length } }
        });
      } catch (notifyErr) { logger.error(`[${requestId}] Exception sending notifications:`, notifyErr); }
    }
  }

  const result = {
    success: true, checked_at: now.toISOString(), alerts_created: alerts.length,
    alerts: alerts.map(a => ({ type: a.alert_type, severity: a.severity, title: a.title })),
    checks_performed: { heartbeats: !heartbeatError, installations: !installError, queued_jobs: !jobsError }
  };

  await supabase.rpc('log_scheduled_job_run', {
    p_job_key: 'check-production-health', p_success: true, p_duration_ms: Date.now() - startedAt,
    p_result: result, p_processed_count: alerts.length, p_job_source: 'cron'
  });

  return result;
});
