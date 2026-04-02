/**
 * check-honeypot-alerts — Cron function to detect attack patterns.
 * 
 * Via serveInternal (cron, every 5 min).
 * Queries honeypot_interactions in a window and generates system_alerts for:
 * - Same IP hash hitting 3+ distinct honeypots
 * - Payloads classified as malicious
 * - Volume anomaly (>20 interactions/hour per IP hash)
 */

import { serveInternal } from '../_shared/serve-internal.ts';

serveInternal(async (_req, { supabase, requestId }) => {
  const windowMinutes = 10;
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const alertsCreated: string[] = [];

  // Fetch recent interactions
  const { data: recent } = await supabase
    .from('honeypot_interactions')
    .select('source_ip_hash, source_ip_prefix, agent_id, tenant_id, classification')
    .gte('created_at', windowStart)
    .limit(500);

  if (!recent || recent.length === 0) {
    return { success: true, request_id: requestId, alerts_created: 0, alerts: [] };
  }

  // Group by source_ip_hash
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

  // 1. Multi-honeypot attack: same IP in 3+ distinct agents
  for (const [ipHash, data] of ipMap.entries()) {
    if (data.agents.size >= 3) {
      await supabase.from('system_alerts').insert({
        tenant_id: data.tenantId,
        alert_type: 'honeypot_multi_target',
        severity: 'high',
        title: `Multi-honeypot attack detected (${data.prefix})`,
        message: `IP prefix ${data.prefix} interacted with ${data.agents.size} distinct honeypot agents in ${windowMinutes} minutes.`,
        details: {
          source_ip_prefix: data.prefix,
          agent_count: data.agents.size,
          agents: [...data.agents].slice(0, 10),
        },
        status: 'active',
      });
      alertsCreated.push(`multi-target:${data.prefix}`);
    }

    // 3. Volume anomaly: >20 interactions per IP in the window
    if (data.count > 20) {
      await supabase.from('system_alerts').insert({
        tenant_id: data.tenantId,
        alert_type: 'honeypot_volume_anomaly',
        severity: 'medium',
        title: `High volume from ${data.prefix}`,
        message: `${data.count} honeypot interactions from IP prefix ${data.prefix} in ${windowMinutes} minutes.`,
        details: { source_ip_prefix: data.prefix, interaction_count: data.count },
        status: 'active',
      });
      alertsCreated.push(`volume:${data.prefix}`);
    }
  }

  // 2. Malicious payloads — group by tenant
  const malicious = recent.filter(r => r.classification === 'malicious');
  if (malicious.length > 0) {
    const tenantAlerts = new Map<string, number>();
    for (const p of malicious) {
      if (!p.tenant_id) continue;
      tenantAlerts.set(p.tenant_id, (tenantAlerts.get(p.tenant_id) || 0) + 1);
    }

    for (const [tenantId, count] of tenantAlerts.entries()) {
      await supabase.from('system_alerts').insert({
        tenant_id: tenantId,
        alert_type: 'honeypot_malicious_payload',
        severity: 'critical',
        title: `${count} malicious honeypot interactions detected`,
        message: `Detected malicious payloads targeting honeypot agents.`,
        details: { interaction_count: count },
        status: 'active',
      });
      alertsCreated.push(`malicious:${tenantId}`);
    }
  }

  return {
    success: true,
    request_id: requestId,
    window_minutes: windowMinutes,
    alerts_created: alertsCreated.length,
    alerts: alertsCreated,
  };
});
