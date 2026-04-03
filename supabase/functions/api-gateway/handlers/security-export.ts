/**
 * siem-export handler — inlined from standalone siem-export function
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { HandlerContext } from './admin.ts';

type SB = ReturnType<typeof createClient>;

const SiemExportSchema = z.object({
  format: z.enum(['cef', 'syslog', 'json']).default('cef'),
  since: z.string().datetime().optional(),
  limit: z.number().int().min(1).max(1000).default(500),
});

function toCEF(event: Record<string, unknown>): string {
  const severity = mapSeverityToCEF(event.severity as string);
  const name = (event.title || event.event_type || 'SecurityEvent') as string;
  const signatureId = event.alert_type || event.event_type || 'unknown';
  const extensions = [
    `src=${event.ip_address || 'N/A'}`, `dhost=${event.agent_name || 'N/A'}`,
    `msg=${(event.message || '').toString().replace(/[=|\\\\]/g, '')}`,
    `cat=${event.alert_type || event.event_type || 'general'}`,
    `rt=${event.created_at || new Date().toISOString()}`,
    event.tenant_id ? `cs1=${event.tenant_id}` : '',
    event.agent_id ? `cs2=${event.agent_id}` : '',
  ].filter(Boolean).join(' ');
  return `CEF:0|CyberShield|EndpointProtection|2.0|${signatureId}|${name}|${severity}|${extensions}`;
}

function mapSeverityToCEF(severity: string): number {
  const map: Record<string, number> = { critical: 10, high: 8, medium: 5, low: 3, info: 1 };
  return map[severity?.toLowerCase()] || 5;
}

function toSyslog(event: Record<string, unknown>): string {
  const pri = mapSeverityToSyslog(event.severity as string);
  const timestamp = event.created_at || new Date().toISOString();
  const hostname = (event.agent_name || 'cybershield') as string;
  const msgId = (event.alert_type || event.event_type || 'GENERIC') as string;
  const msg = (event.message || event.title || '') as string;
  const sd = `[cybershield@1 tenantId="${event.tenant_id || ''}" agentId="${event.agent_id || ''}" severity="${event.severity || 'medium'}" category="${event.alert_type || ''}"]`;
  return `<${pri}>1 ${timestamp} ${hostname} CyberShield - ${msgId} ${sd} ${msg}`;
}

function mapSeverityToSyslog(severity: string): number {
  const severityMap: Record<string, number> = { critical: 2, high: 3, medium: 4, low: 5, info: 6 };
  return 4 * 8 + (severityMap[severity?.toLowerCase()] || 4);
}

export async function handleSiemExport(
  supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const tenantId = ctx?.tenantId;
  if (!ctx?.userId || !tenantId) return { __status: 401, error: 'Authentication required' };

  const parsed = SiemExportSchema.safeParse(payload);
  if (!parsed.success) {
    return { __status: 400, error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors };
  }

  const format = parsed.data.format;
  const since = parsed.data.since || new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const limit = parsed.data.limit;

  const [alertsRes, quarantineRes, vulnRes] = await Promise.all([
    supabase.from('system_alerts').select('id, tenant_id, alert_type, severity, title, message, details, created_at')
      .eq('tenant_id', tenantId).gte('created_at', since).order('created_at', { ascending: false }).limit(limit),
    supabase.from('quarantined_files').select('id, tenant_id, agent_name, file_path, file_hash, quarantine_reason, status, quarantined_at')
      .eq('tenant_id', tenantId).gte('quarantined_at', since).order('quarantined_at', { ascending: false }).limit(limit),
    supabase.from('agent_vulnerabilities').select('id, agent_id, cve_id, severity, software_name, remediation_status, created_at')
      .gte('created_at', since).order('created_at', { ascending: false }).limit(limit),
  ]);

  const events: Record<string, unknown>[] = [];

  for (const alert of alertsRes.data || []) {
    events.push({ ...alert, event_type: 'alert', agent_name: (alert.details as Record<string, unknown>)?.agentName });
  }
  for (const qf of quarantineRes.data || []) {
    events.push({ id: qf.id, tenant_id: qf.tenant_id, event_type: 'quarantine', alert_type: 'quarantine', severity: 'critical', title: 'File Quarantined', message: qf.quarantine_reason, agent_name: qf.agent_name, created_at: qf.quarantined_at });
  }
  for (const vuln of vulnRes.data || []) {
    events.push({ id: vuln.id, tenant_id: tenantId, event_type: 'vulnerability', alert_type: 'vulnerability', severity: vuln.severity, title: `CVE: ${vuln.cve_id}`, message: `${vuln.software_name} - ${vuln.remediation_status}`, agent_id: vuln.agent_id, created_at: vuln.created_at });
  }

  events.sort((a, b) => new Date(b.created_at as string).getTime() - new Date(a.created_at as string).getTime());

  // Record export
  const { data: configData } = await supabase.from('siem_export_configs').select('id').eq('tenant_id', tenantId).eq('format', format).maybeSingle();
  if (configData) {
    await supabase.from('siem_export_history').insert({ tenant_id: tenantId, config_id: configData.id, events_exported: events.length, format, status: 'success' });
    await supabase.from('siem_export_configs').update({ last_export_at: new Date().toISOString() }).eq('id', configData.id);
  }

  // Format output
  if (format === 'cef') {
    return { output: events.map(toCEF).join('\n'), content_type: 'text/plain', events_count: events.length };
  } else if (format === 'syslog') {
    return { output: events.map(toSyslog).join('\n'), content_type: 'text/plain', events_count: events.length };
  }
  return { events, total: events.length, format: 'json', exported_at: new Date().toISOString() };
}
