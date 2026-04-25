// @ts-nocheck
/**
 * Honeypot cron handlers — inlined from check-honeypot-alerts + dispatch-honeypot-ai
 * Phase 4: Cron job migration to gateways
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

type SB = any;

const MAX_ALERTS_PER_RUN = 10;

// ═══ check:honeypot-alerts ═══
export async function handleCheckHoneypotAlerts(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const windowMinutes = 10;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const alertsCreated: string[] = [];

  const { data: recent } = await supabase
    .from('honeypot_interactions')
    .select('source_ip_hash, source_ip_prefix, agent_id, tenant_id, classification')
    .gte('created_at', windowStart)
    .limit(500);

  if (!recent || recent.length === 0) {
    return { success: true, request_id: requestId, alerts_created: 0, alerts: [] };
  }

  const ipMap = new Map<string, { agents: Set<string>; tenantId: string; count: number; prefix: string }>();

  for (const row of recent) {
    if (!row.source_ip_hash) continue;
    if (!ipMap.has(row.source_ip_hash)) {
      ipMap.set(row.source_ip_hash, {
        agents: new Set(),
        tenantId: row.tenant_id,
        count: 0,
        prefix: row.source_ip_prefix || 'unknown',
      });
    }
    const entry = ipMap.get(row.source_ip_hash)!;
    if (row.agent_id) entry.agents.add(row.agent_id);
    entry.count++;
  }

  async function insertAlertDeduped(alert: {
    alert_type: string;
    severity: string;
    title: string;
    message: string;
    details: Record<string, unknown>;
    tenant_id: string;
  }): Promise<boolean> {
    if (alertsCreated.length >= MAX_ALERTS_PER_RUN) return false;

    const { data: existing } = await supabase
      .from('system_alerts')
      .select('id')
      .eq('alert_type', alert.alert_type)
      .eq('tenant_id', alert.tenant_id)
      .gte('created_at', windowStart)
      .limit(1)
      .maybeSingle();

    if (existing) return false;

    const { error } = await supabase.from('system_alerts').insert({
      ...alert,
      status: 'active',
    });

    if (error) {
      logger.error(`[check-honeypot-alerts] Insert error: ${error.message}`);
      return false;
    }

    alertsCreated.push(`${alert.alert_type}:${alert.tenant_id}`);
    return true;
  }

  // 1. Multi-honeypot attack: same IP in 3+ distinct agents
  for (const [_ipHash, data] of ipMap.entries()) {
    if (data.agents.size >= 3) {
      await insertAlertDeduped({
        alert_type: 'honeypot_multi_target',
        severity: 'high',
        title: `Multi-honeypot attack detected (${data.prefix})`,
        message: `IP prefix ${data.prefix} interacted with ${data.agents.size} distinct honeypot agents in ${windowMinutes} minutes.`,
        details: { source_ip_prefix: data.prefix, agent_count: data.agents.size, agents: [...data.agents].slice(0, 10) },
        tenant_id: data.tenantId,
      });
    }

    if (data.count > 20) {
      await insertAlertDeduped({
        alert_type: 'honeypot_volume_anomaly',
        severity: 'medium',
        title: `High volume from ${data.prefix}`,
        message: `${data.count} honeypot interactions from IP prefix ${data.prefix} in ${windowMinutes} minutes.`,
        details: { source_ip_prefix: data.prefix, interaction_count: data.count },
        tenant_id: data.tenantId,
      });
    }
  }

  // 3. Malicious payloads
  const malicious = recent.filter(r => r.classification === 'malicious');
  if (malicious.length > 0) {
    const tenantAlerts = new Map<string, number>();
    for (const p of malicious) {
      if (!p.tenant_id) continue;
      tenantAlerts.set(p.tenant_id, (tenantAlerts.get(p.tenant_id) || 0) + 1);
    }

    for (const [tenantId, count] of tenantAlerts.entries()) {
      await insertAlertDeduped({
        alert_type: 'honeypot_malicious_payload',
        severity: 'critical',
        title: `${count} malicious honeypot interactions detected`,
        message: `Detected malicious payloads targeting honeypot agents.`,
        details: { interaction_count: count },
        tenant_id: tenantId,
      });
    }
  }

  return {
    success: true,
    request_id: requestId,
    window_minutes: windowMinutes,
    alerts_created: alertsCreated.length,
    alerts: alertsCreated,
    suppressed: alertsCreated.length >= MAX_ALERTS_PER_RUN,
  };
}

// ═══ check:honeypot-dispatch-ai ═══
const BATCH_SIZE = 20;
const MAX_PER_TENANT_PER_DAY = 100;

export async function handleHoneypotDispatchAi(supabase: SB, requestId: string, _payload: Record<string, unknown>) {
  const { data: pending, error: fetchError } = await supabase
    .from('honeypot_interactions')
    .select('id, tenant_id, mode, method, path, body_snippet, classification, source_ip_prefix, created_at')
    .eq('ai_analyzed', false)
    .in('classification', ['suspicious', 'malicious'])
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE);

  if (fetchError) {
    logger.error(`[dispatch-honeypot-ai] Fetch error: ${fetchError.message}`);
    return { success: false, error: fetchError.message };
  }

  if (!pending || pending.length === 0) {
    return { success: true, request_id: requestId, processed: 0 };
  }

  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const tenantBudgets = new Map<string, number>();

  for (const item of pending) {
    if (!tenantBudgets.has(item.tenant_id)) {
      const { count } = await supabase
        .from('honeypot_interactions')
        .select('id', { count: 'exact', head: true })
        .eq('tenant_id', item.tenant_id)
        .eq('ai_analyzed', true)
        .gte('created_at', today.toISOString());
      tenantBudgets.set(item.tenant_id, count || 0);
    }
  }

  const eligibleIds = pending
    .filter(p => (tenantBudgets.get(p.tenant_id) || 0) < MAX_PER_TENANT_PER_DAY)
    .map(p => p.id);

  if (eligibleIds.length === 0) {
    await supabase
      .from('honeypot_interactions')
      .update({ ai_analyzed: true })
      .in('id', pending.map(p => p.id));
    return { success: true, request_id: requestId, processed: 0, budget_exceeded: true };
  }

  await supabase
    .from('honeypot_interactions')
    .update({ ai_analyzed: true })
    .in('id', eligibleIds);

  const processed = eligibleIds.length;
  logger.info(`[dispatch-honeypot-ai][${requestId}] Marked ${processed} interactions as analyzed`);

  return {
    success: true,
    request_id: requestId,
    processed,
    skipped_budget: pending.length - processed,
  };
}