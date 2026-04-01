import { supabase } from '@/integrations/supabase/client';
import type { AgentInfo, ProcessEntry, NetworkEvent, FileEvent, ForensicData } from './types';
import { KNOWN_SAFE_PROCESSES } from './types';

export async function fetchForensicData(agentId: string): Promise<ForensicData> {
  const { data: agentRow } = await supabase
    .from('agents')
    .select('id, hostname, agent_name, agent_version, os_type, os_version, status, agent_state, last_heartbeat, is_isolated')
    .eq('id', agentId)
    .single();

  if (!agentRow) throw new Error('Agente não encontrado');
  const agent = agentRow as unknown as AgentInfo;

  const { data: processRows } = await supabase
    .from('agent_processes')
    .select('processes, suspicious_processes, collected_at')
    .eq('agent_id', agentId)
    .order('collected_at', { ascending: false })
    .limit(5);

  const latestSnapshot = processRows?.[0];
  const processes: ProcessEntry[] = ((latestSnapshot?.processes as unknown[]) || []).map((p: Record<string, unknown>) => ({
    pid: p.pid, name: p.name, cpu_percent: p.cpu_percent,
    memory_mb: p.memory_mb, user: p.user, command_line: p.command_line,
  }));

  const suspiciousProcesses: string[][] = (processRows || [])
    .filter((r: Record<string, unknown>) => r.suspicious_processes && (r.suspicious_processes as string[]).length > 0)
    .map((r: Record<string, unknown>) => [
      new Date(r.collected_at).toLocaleString('pt-BR'),
      ...(r.suspicious_processes as string[]),
    ]);

  const { data: netRaw } = await supabase
    .from('endpoint_event_buffer')
    .select('payload')
    .eq('agent_id', agentId)
    .eq('event_category', 'network')
    .order('received_at', { ascending: false })
    .limit(500);

  const networkEvents: NetworkEvent[] = ((netRaw || []) as unknown[]).map((r: Record<string, unknown>) => ({
    remote_address: r.payload?.remote_address || '',
    remote_port: Number(r.payload?.remote_port) || 0,
    process_name: r.payload?.process_name || '',
    direction: r.payload?.direction || '',
    is_suspicious: r.payload?.is_suspicious === true || r.payload?.is_suspicious === 'true',
  }));

  const procMap = new Map<string, { count: number; ips: Set<string> }>();
  for (const ne of networkEvents) {
    const entry = procMap.get(ne.process_name) || { count: 0, ips: new Set<string>() };
    entry.count++;
    entry.ips.add(ne.remote_address);
    procMap.set(ne.process_name, entry);
  }
  const networkSummary = Array.from(procMap.entries())
    .map(([proc, v]) => ({ proc, count: v.count, uniqueIps: v.ips.size }))
    .sort((a, b) => b.count - a.count);

  const nonStdPorts = networkEvents
    .filter(ne => ne.remote_port !== 80 && ne.remote_port !== 443 && ne.remote_port > 0)
    .slice(0, 20)
    .map(ne => ({ ip: ne.remote_address, port: String(ne.remote_port), proc: ne.process_name }));

  const { data: fileRaw } = await supabase
    .from('endpoint_event_buffer')
    .select('payload')
    .eq('agent_id', agentId)
    .eq('event_category', 'file')
    .order('received_at', { ascending: false })
    .limit(50);

  const fileEvents: FileEvent[] = ((fileRaw || []) as unknown[]).map((r: Record<string, unknown>) => ({
    file_path: r.payload?.file_path || '',
    event_type: r.payload?.event_type || '',
    process_name: r.payload?.process_name || undefined,
    is_suspicious: r.payload?.is_suspicious === true || r.payload?.is_suspicious === 'true',
  }));

  const { data: alertsRaw } = await supabase
    .from('system_alerts')
    .select('alert_type, severity, title, message, created_at')
    .eq('agent_id', agentId)
    .order('created_at', { ascending: false })
    .limit(20);

  const alerts = ((alertsRaw || []) as Array<{ alert_type: string; severity: string; title: string; message: string; created_at: string }>).map(a => ({
    type: a.alert_type, severity: a.severity,
    title: a.title, message: a.message, created_at: a.created_at,
  }));

  const { data: domainsRaw } = await supabase
    .from('agent_web_activity')
    .select('domain, is_blocked')
    .eq('agent_id', agentId)
    .order('visited_at', { ascending: false })
    .limit(50);

  const domainsMap = new Map<string, boolean>();
  for (const d of (domainsRaw || []) as Array<{ domain: string; is_blocked: boolean }>) {
    if (d.domain && !domainsMap.has(d.domain)) {
      domainsMap.set(d.domain, d.is_blocked === true);
    }
  }
  const domains = Array.from(domainsMap.entries()).map(([domain, is_blocked]) => ({ domain, is_blocked }));

  const realSuspicious = suspiciousProcesses.flat()
    .filter(name => typeof name === 'string' && !KNOWN_SAFE_PROCESSES.has(name.toLowerCase()));
  const hasSuspiciousNetwork = networkEvents.some(ne => ne.is_suspicious);
  const hasSuspiciousFiles = fileEvents.some(fe => fe.is_suspicious);
  const hasCriticalAlerts = alerts.some(a => a.severity === 'critical');

  let verdict: 'clean' | 'suspicious' | 'compromised' = 'clean';
  const verdictDetails: string[] = [];

  if (hasCriticalAlerts) { verdict = 'suspicious'; verdictDetails.push('Alertas críticos detectados no histórico'); }
  if (realSuspicious.length > 3) { verdict = 'suspicious'; verdictDetails.push(`${realSuspicious.length} processos genuinamente suspeitos detectados`); }
  if (hasSuspiciousNetwork) { verdict = 'suspicious'; verdictDetails.push('Conexões de rede marcadas como suspeitas'); }
  if (hasSuspiciousFiles) { verdict = 'suspicious'; verdictDetails.push('Atividade de arquivo suspeita detectada'); }
  if (verdict === 'clean') {
    verdictDetails.push('Nenhuma evidência de comprometimento detectada');
    verdictDetails.push('Todos os processos identificados são legítimos');
    verdictDetails.push('Tráfego de rede dentro dos padrões normais');
  }

  return { agent, processes, suspiciousProcesses, networkSummary, nonStandardPorts: nonStdPorts, fileEvents, alerts, domains, verdict, verdictDetails };
}
