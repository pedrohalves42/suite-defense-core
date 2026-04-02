/**
 * check-honeypot-alerts — Cron function to detect attack patterns.
 * 
 * Via serveInternal (cron, every 5 min).
 * Queries honeypot_interactions in a window and generates system_alerts for:
 * - Same IP hitting 3+ distinct honeypots
 * - Payloads classified as malicious
 * - Volume anomaly (>20 interactions/hour per IP)
 */

import { serveInternal } from '../_shared/serve-internal.ts';

serveInternal(async (_req, { supabase, requestId }) => {
  const windowMinutes = 10; // Look back 10 minutes
  const windowStart = new Date(Date.now() - windowMinutes * 60 * 1000).toISOString();
  const alertsCreated: string[] = [];

  // 1. Multi-honeypot attack: same IP in 3+ distinct agents
  const { data: multiHoneypot } = await supabase
    .from('honeypot_interactions')
    .select('source_ip, agent_id, tenant_id')
    .gte('created_at', windowStart);

  if (multiHoneypot && multiHoneypot.length > 0) {
    // Group by source_ip
    const ipMap = new Map<string, Set<string>>();
    const ipTenant = new Map<string, string>();

    for (const row of multiHoneypot) {
      if (!row.source_ip) continue;
      if (!ipMap.has(row.source_ip)) {
        ipMap.set(row.source_ip, new Set());
      }
      if (row.agent_id) ipMap.get(row.source_ip)!.add(row.agent_id);
      if (row.tenant_id) ipTenant.set(row.source_ip, row.tenant_id);
    }

    for (const [ip, agents] of ipMap.entries()) {
      if (agents.size >= 3) {
        const tenantId = ipTenant.get(ip);
        if (tenantId) {
          await supabase.from('system_alerts').insert({
            tenant_id: tenantId,
            alert_type: 'honeypot_multi_target',
            severity: 'high',
            title: `Multi-honeypot attack from ${ip}`,
            message: `IP ${ip} interacted with ${agents.size} distinct honeypot agents in ${windowMinutes} minutes.`,
            details: { source_ip: ip, agent_count: agents.size, agents: [...agents].slice(0, 10) },
            status: 'active',
          });
          alertsCreated.push(`multi-target:${ip}`);
        }
      }
    }
  }

  // 2. Malicious payloads
  const { data: maliciousPayloads } = await supabase
    .from('honeypot_interactions')
    .select('id, source_ip, tenant_id, agent_id, classification, path, body_snippet')
    .gte('created_at', windowStart)
    .eq('classification', 'malicious')
    .limit(50);

  if (maliciousPayloads && maliciousPayloads.length > 0) {
    // Group by tenant to avoid alert spam
    const tenantAlerts = new Map<string, typeof maliciousPayloads>();
    for (const p of maliciousPayloads) {
      if (!p.tenant_id) continue;
      if (!tenantAlerts.has(p.tenant_id)) tenantAlerts.set(p.tenant_id, []);
      tenantAlerts.get(p.tenant_id)!.push(p);
    }

    for (const [tenantId, payloads] of tenantAlerts.entries()) {
      await supabase.from('system_alerts').insert({
        tenant_id: tenantId,
        alert_type: 'honeypot_malicious_payload',
        severity: 'critical',
        title: `${payloads.length} malicious honeypot interactions detected`,
        message: `Detected malicious payloads targeting honeypot agents. IPs: ${[...new Set(payloads.map(p => p.source_ip))].join(', ')}`,
        details: {
          interaction_count: payloads.length,
          sample_paths: [...new Set(payloads.map(p => p.path))].slice(0, 5),
          source_ips: [...new Set(payloads.map(p => p.source_ip))].slice(0, 10),
        },
        status: 'active',
      });
      alertsCreated.push(`malicious:${tenantId}`);
    }
  }

  // 3. Volume anomaly: >20 interactions per IP in the window
  if (multiHoneypot && multiHoneypot.length > 0) {
    const ipCount = new Map<string, number>();
    for (const row of multiHoneypot) {
      if (!row.source_ip) continue;
      ipCount.set(row.source_ip, (ipCount.get(row.source_ip) || 0) + 1);
    }

    for (const [ip, count] of ipCount.entries()) {
      if (count > 20) {
        const tenantId = ipTenant?.get(ip) || multiHoneypot.find(r => r.source_ip === ip)?.tenant_id;
        if (tenantId) {
          await supabase.from('system_alerts').insert({
            tenant_id: tenantId,
            alert_type: 'honeypot_volume_anomaly',
            severity: 'medium',
            title: `High volume from ${ip}`,
            message: `${count} honeypot interactions from IP ${ip} in ${windowMinutes} minutes.`,
            details: { source_ip: ip, interaction_count: count },
            status: 'active',
          });
          alertsCreated.push(`volume:${ip}`);
        }
      }
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
