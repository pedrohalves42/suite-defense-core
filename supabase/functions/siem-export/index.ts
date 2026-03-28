import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

// ?? CEF Format ??
function toCEF(event: Record<string, unknown>): string {
  const severity = mapSeverityToCEF(event.severity as string);
  const name = (event.title || event.event_type || 'SecurityEvent') as string;
  const deviceVendor = 'CyberShield';
  const deviceProduct = 'EndpointProtection';
  const deviceVersion = '2.0';
  const signatureId = event.alert_type || event.event_type || 'unknown';

  const extensions = [
    `src=${event.ip_address || 'N/A'}`,
    `dhost=${event.agent_name || 'N/A'}`,
    `msg=${(event.message || '').toString().replace(/[=|\\\\]/g, '')}`,
    `cat=${event.alert_type || event.event_type || 'general'}`,
    `rt=${event.created_at || new Date().toISOString()}`,
    event.tenant_id ? `cs1=${event.tenant_id}` : '',
    event.agent_id ? `cs2=${event.agent_id}` : '',
  ].filter(Boolean).join(' ');

  return `CEF:0|${deviceVendor}|${deviceProduct}|${deviceVersion}|${signatureId}|${name}|${severity}|${extensions}`;
}

function mapSeverityToCEF(severity: string): number {
  const map: Record<string, number> = {
    critical: 10, high: 8, medium: 5, low: 3, info: 1,
  };
  return map[severity?.toLowerCase()] || 5;
}

// ?? Syslog RFC 5424 Format ??
function toSyslog(event: Record<string, unknown>): string {
  const pri = mapSeverityToSyslog(event.severity as string);
  const timestamp = event.created_at || new Date().toISOString();
  const hostname = (event.agent_name || 'cybershield') as string;
  const appName = 'CyberShield';
  const procId = '-';
  const msgId = (event.alert_type || event.event_type || 'GENERIC') as string;
  const msg = (event.message || event.title || '') as string;

  const sd = `[cybershield@1 tenantId="${event.tenant_id || ''}" agentId="${event.agent_id || ''}" severity="${event.severity || 'medium'}" category="${event.alert_type || ''}"]`;

  return `<${pri}>1 ${timestamp} ${hostname} ${appName} ${procId} ${msgId} ${sd} ${msg}`;
}

function mapSeverityToSyslog(severity: string): number {
  const severityMap: Record<string, number> = {
    critical: 2, high: 3, medium: 4, low: 5, info: 6,
  };
  return 4 * 8 + (severityMap[severity?.toLowerCase()] || 4);
}

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, requestId, body } = ctx;

  const format = body.format || 'cef';
  const since = body.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const limit = Math.min(body.limit || 500, 1000);

  // Collect events from multiple sources
  const [alertsRes, quarantineRes, vulnRes] = await Promise.all([
    supabase.from('system_alerts')
      .select('id, tenant_id, alert_type, severity, title, message, details, created_at')
      .eq('tenant_id', tenantId)
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit),
    supabase.from('quarantined_files')
      .select('id, tenant_id, agent_name, file_path, file_hash, quarantine_reason, status, quarantined_at')
      .eq('tenant_id', tenantId)
      .gte('quarantined_at', since)
      .order('quarantined_at', { ascending: false })
      .limit(limit),
    supabase.from('agent_vulnerabilities')
      .select('id, agent_id, cve_id, severity, software_name, remediation_status, created_at')
      .gte('created_at', since)
      .order('created_at', { ascending: false })
      .limit(limit),
  ]);

  // Normalize events
  const events: Record<string, unknown>[] = [];

  for (const alert of alertsRes.data || []) {
    events.push({
      ...alert,
      event_type: 'alert',
      agent_name: (alert.details as Record<string, unknown>)?.agentName,
    });
  }

  for (const qf of quarantineRes.data || []) {
    events.push({
      id: qf.id,
      tenant_id: qf.tenant_id,
      event_type: 'quarantine',
      alert_type: 'quarantine',
      severity: 'critical',
      title: 'File Quarantined',
      message: qf.quarantine_reason,
      agent_name: qf.agent_name,
      created_at: qf.quarantined_at,
    });
  }

  for (const vuln of vulnRes.data || []) {
    events.push({
      id: vuln.id,
      tenant_id: tenantId,
      event_type: 'vulnerability',
      alert_type: 'vulnerability',
      severity: vuln.severity,
      title: `CVE: ${vuln.cve_id}`,
      message: `${vuln.software_name} - ${vuln.remediation_status}`,
      agent_id: vuln.agent_id,
      created_at: vuln.created_at,
    });
  }

  // Sort by time
  events.sort((a, b) => {
    const ta = new Date(a.created_at as string).getTime();
    const tb = new Date(b.created_at as string).getTime();
    return tb - ta;
  });

  // Format
  let output: string;
  let contentType: string;

  if (format === 'cef') {
    output = events.map(toCEF).join('\n');
    contentType = 'text/plain';
  } else if (format === 'syslog') {
    output = events.map(toSyslog).join('\n');
    contentType = 'text/plain';
  } else {
    output = JSON.stringify({ events, total: events.length, format: 'json', exported_at: new Date().toISOString() });
    contentType = 'application/json';
  }

  // Record export in history
  const { data: configData } = await supabase
    .from('siem_export_configs')
    .select('id')
    .eq('tenant_id', tenantId)
    .eq('format', format)
    .maybeSingle();

  if (configData) {
    await supabase.from('siem_export_history').insert({
      tenant_id: tenantId,
      config_id: configData.id,
      events_exported: events.length,
      format,
      status: 'success',
    });

    await supabase.from('siem_export_configs')
      .update({ last_export_at: new Date().toISOString() })
      .eq('id', configData.id);
  }

  return new Response(output, {
    headers: {
      'Content-Type': contentType,
      'Content-Disposition': `attachment; filename="cybershield-siem-export-${format}-${Date.now()}.${format === 'json' ? 'json' : 'log'}"`,
      'X-Events-Count': events.length.toString(),
    },
  });
}, { methods: ['POST'] });
