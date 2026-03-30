/**
 * Alert generation and auto-resolution engine for system metrics.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';

interface AlertThresholdInput {
  cpu_usage_percent?: number;
  memory_usage_percent?: number;
  memory_used_gb?: number;
  memory_total_gb?: number;
  disk_usage_percent?: number;
}

interface AgentRef {
  id: string;
  agent_name: string;
  tenant_id: string;
}

const ALERT_COOLDOWN_MINUTES = 60;

/** Generate alerts if metrics exceed thresholds */
export async function generateAlerts(
  supabase: SupabaseClient,
  agent: AgentRef,
  metrics: AlertThresholdInput,
): Promise<number> {
  const alerts: Record<string, unknown>[] = [];

  // Fetch existing alerts for cooldown check
  const { data: existingAlerts } = await supabase
    .from('system_alerts')
    .select('alert_type, created_at, resolved')
    .eq('agent_id', agent.id)
    .eq('tenant_id', agent.tenant_id)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString());

  const hasRecentAlert = (type: string) => {
    if (!existingAlerts) return false;
    return existingAlerts.some(
      (a) => a.alert_type === type && !a.resolved &&
        new Date(a.created_at).getTime() > Date.now() - ALERT_COOLDOWN_MINUTES * 60 * 1000,
    );
  };

  // CPU: 98%
  if (metrics.cpu_usage_percent && metrics.cpu_usage_percent > 98 && !hasRecentAlert('high_cpu')) {
    alerts.push({
      tenant_id: agent.tenant_id, agent_id: agent.id, alert_type: 'high_cpu', severity: 'critical',
      title: `CPU Critico: ${agent.agent_name}`,
      message: `Uso de CPU em ${metrics.cpu_usage_percent.toFixed(1)}% (limite: 98%)`,
      details: { cpu_usage: metrics.cpu_usage_percent },
    });
  }

  // Memory: 90%
  if (metrics.memory_usage_percent && metrics.memory_usage_percent > 90 && !hasRecentAlert('high_memory')) {
    alerts.push({
      tenant_id: agent.tenant_id, agent_id: agent.id, alert_type: 'high_memory', severity: 'high',
      title: `Memoria Alta: ${agent.agent_name}`,
      message: `Uso de memoria em ${metrics.memory_usage_percent.toFixed(1)}% (limite: 90%)`,
      details: { memory_usage: metrics.memory_usage_percent },
    });
  }

  // Disk: 97%
  if (metrics.disk_usage_percent && metrics.disk_usage_percent > 97 && !hasRecentAlert('high_disk')) {
    alerts.push({
      tenant_id: agent.tenant_id, agent_id: agent.id, alert_type: 'high_disk', severity: 'critical',
      title: `Disco Critico: ${agent.agent_name}`,
      message: `Uso de disco em ${metrics.disk_usage_percent.toFixed(1)}% (limite: 97%)`,
      details: { disk_usage: metrics.disk_usage_percent },
    });
  }

  // Memory Warning: 85-90%
  if (metrics.memory_usage_percent && metrics.memory_usage_percent > 85 && metrics.memory_usage_percent <= 90 && !hasRecentAlert('memory_warning')) {
    alerts.push({
      tenant_id: agent.tenant_id, agent_id: agent.id, alert_type: 'memory_warning', severity: 'medium',
      title: `Memoria Elevada: ${agent.agent_name}`,
      message: `Uso de memoria em ${metrics.memory_usage_percent.toFixed(1)}% - considerar otimizacao`,
      details: {
        memory_usage: metrics.memory_usage_percent,
        memory_used_gb: metrics.memory_used_gb,
        memory_total_gb: metrics.memory_total_gb,
        recommendation: 'Monitorar tendencia de crescimento. Considerar otimizacao se aproximar de 90%.',
      },
    });
  }

  if (alerts.length > 0) {
    const { error: alertError } = await supabase.from('system_alerts').insert(alerts);
    if (alertError) logger.error('Failed to insert alerts', alertError);
    else logger.info(`${alerts.length} alerts generated`);
  }

  return alerts.length;
}

/** Auto-resolve non-critical alerts when metrics normalize */
export async function autoResolveAlerts(
  supabase: SupabaseClient,
  agentId: string,
  metrics: AlertThresholdInput,
): Promise<void> {
  const alertsToResolve: string[] = [];

  if (metrics.cpu_usage_percent !== undefined && metrics.cpu_usage_percent < 90) {
    alertsToResolve.push('high_cpu');
  }
  if (metrics.memory_usage_percent !== undefined && metrics.memory_usage_percent < 80) {
    alertsToResolve.push('high_memory', 'memory_warning');
  }
  if (metrics.disk_usage_percent !== undefined && metrics.disk_usage_percent <= 95) {
    alertsToResolve.push('high_disk');
  }

  if (alertsToResolve.length > 0) {
    const now = new Date().toISOString();
    // ADR-029: Critical alerts require human resolution
    const { error: resolveError, count: resolvedCount } = await supabase
      .from('system_alerts')
      .update({
        resolved: true,
        resolved_at: now,
        resolution_notes: 'Auto-resolved: metric returned to normal threshold',
      })
      .eq('agent_id', agentId)
      .eq('resolved', false)
      .in('severity', ['low', 'medium', 'high'])
      .in('alert_type', alertsToResolve);

    if (resolveError) logger.error('Failed to auto-resolve alerts', resolveError);
    else if (resolvedCount && resolvedCount > 0) logger.info(`Auto-resolved ${resolvedCount} non-critical alerts`);
  }
}
