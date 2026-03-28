import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

// COST-OPT v4: heartbeat padrao de 10min ? considerar offline apenas apos 30min
const OFFLINE_THRESHOLD_MINUTES = 30;

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, requestId } = ctx;

  // Buscar dados consolidados usando a funcao do banco
  const { data: agentsWithMetrics, error: metricsError } = await supabase
    .rpc('get_latest_agent_metrics', { p_tenant_id: tenantId });

  if (metricsError) {
    logger.error(`[${requestId}] Metrics error:`, metricsError);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch metrics' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Buscar alertas pendentes (nao resolvidos E nao reconhecidos)
  const { data: recentAlerts, error: alertsError } = await supabase
    .from('system_alerts')
    .select('*')
    .eq('tenant_id', tenantId)
    .eq('resolved', false)
    .eq('acknowledged', false)
    .order('created_at', { ascending: false })
    .limit(50);

  if (alertsError) {
    logger.error(`[${requestId}] Alerts error:`, alertsError);
  }

  // Calcular estatisticas agregadas
  const now = new Date();
  const offlineThreshold = new Date(now.getTime() - OFFLINE_THRESHOLD_MINUTES * 60 * 1000);

  let totalAgents = 0;
  let onlineAgents = 0;
  let offlineAgents = 0;
  let windowsAgents = 0;
  let linuxAgents = 0;
  let totalCpu = 0;
  let totalMemory = 0;
  let totalDisk = 0;
  let metricsCount = 0;

  const agents = (agentsWithMetrics || []).map((agent: Record<string, unknown>) => {
    totalAgents++;
    
    const lastHeartbeat = agent.last_heartbeat ? new Date(agent.last_heartbeat) : null;
    const isOnline = !!lastHeartbeat && lastHeartbeat >= offlineThreshold;
    
    if (isOnline) {
      onlineAgents++;
    } else {
      offlineAgents++;
    }

    if (agent.os_type === 'windows') {
      windowsAgents++;
    } else if (agent.os_type === 'linux') {
      linuxAgents++;
    }

    if (agent.cpu_usage_percent !== null) {
      totalCpu += parseFloat(agent.cpu_usage_percent);
      metricsCount++;
    }
    if (agent.memory_usage_percent !== null) {
      totalMemory += parseFloat(agent.memory_usage_percent);
    }
    if (agent.disk_usage_percent !== null) {
      totalDisk += parseFloat(agent.disk_usage_percent);
    }

    return {
      id: agent.agent_id,
      name: agent.agent_name,
      os_type: agent.os_type || 'unknown',
      os_version: agent.os_version,
      hostname: agent.hostname,
      status: agent.status,
      last_heartbeat: agent.last_heartbeat,
      is_online: isOnline,
      cpu_usage: agent.cpu_usage_percent ? parseFloat(agent.cpu_usage_percent) : null,
      memory_usage: agent.memory_usage_percent ? parseFloat(agent.memory_usage_percent) : null,
      disk_usage: agent.disk_usage_percent ? parseFloat(agent.disk_usage_percent) : null,
      uptime_hours: agent.uptime_seconds ? Math.floor(agent.uptime_seconds / 3600) : null,
      metrics_age_minutes: agent.metrics_age_minutes,
      agent_version: agent.agent_version || null,
    };
  });

  // Contar alertas por severidade
  const criticalAlerts = (recentAlerts || []).filter((a: Record<string, unknown>) => a.severity === 'critical').length;
  const highAlerts = (recentAlerts || []).filter((a: Record<string, unknown>) => a.severity === 'high').length;

  const summary = {
    total_agents: totalAgents,
    online_agents: onlineAgents,
    offline_agents: offlineAgents,
    windows_agents: windowsAgents,
    linux_agents: linuxAgents,
    avg_cpu_usage: metricsCount > 0 ? (totalCpu / metricsCount).toFixed(1) : null,
    avg_memory_usage: metricsCount > 0 ? (totalMemory / metricsCount).toFixed(1) : null,
    avg_disk_usage: metricsCount > 0 ? (totalDisk / metricsCount).toFixed(1) : null,
    critical_alerts: criticalAlerts,
    high_alerts: highAlerts,
  };

  return {
    summary,
    agents,
    recent_alerts: recentAlerts || [],
  };
}, { methods: ['POST', 'GET'] });
