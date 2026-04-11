/**
 * Handler: process snapshot submission (migrated from submit-processes)
 * Bug fix: original L131 used undefined `payload` variable → now uses destructured fields.
 * Auth: Token-only (no HMAC) — lives in submit-router, not submit-hmac-router.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../logger.ts';

interface ProcessEntry {
  pid: number;
  name: string;
  cpu_percent: number;
  memory_mb: number;
  user: string;
  command_line?: string;
  start_time?: string;
}

interface ServiceEntry {
  name: string;
  display_name: string;
  status: string;
  startup_type: string;
  description?: string;
}

const SUSPICIOUS_PATHS = ['\\temp\\', '\\tmp\\', '\\downloads\\', '\\appdata\\local\\temp\\'];

const SAFE_PROCESSES = new Set([
  'teamviewer_service.exe', 'teamviewer.exe',
  'anydesk.exe', 'anydesk service.exe',
  'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
  'code.exe', 'devenv.exe',
  'onedrive.exe', 'dropbox.exe',
  'slack.exe', 'teams.exe', 'zoom.exe',
  'windowsdefender.exe', 'msmpeng.exe',
  'svchost.exe', 'explorer.exe', 'taskhostw.exe',
]);

export async function handleProcesses(
  supabase: SupabaseClient,
  agentId: string,
  _agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
  _agentData?: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const processes = (body.processes as ProcessEntry[]) || [];
  const services = (body.services as ServiceEntry[]) || [];
  const totalProcesses = (body.total_processes as number) ?? processes.length;
  const totalServices = (body.total_services as number) ?? services.length;
  const servicesRunning = (body.services_running as number) ?? services.filter(s => s.status === 'Running').length;
  const servicesStopped = (body.services_stopped as number) ?? services.filter(s => s.status === 'Stopped').length;

  // Detect new processes by comparing with last snapshot
  let newProcesses: ProcessEntry[] = [];
  const { data: lastSnapshot } = await supabase
    .from('agent_processes')
    .select('processes')
    .eq('agent_id', agentId)
    .order('collected_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (lastSnapshot?.processes) {
    const previousNames = new Set(
      (lastSnapshot.processes as ProcessEntry[]).map(p => p.name.toLowerCase()),
    );
    newProcesses = processes.filter(p => !previousNames.has(p.name.toLowerCase()));
  }

  // Detect suspicious processes running from temp/download folders
  const suspiciousProcesses = processes.filter(p =>
    p.command_line &&
    SUSPICIOUS_PATHS.some(sp => p.command_line!.toLowerCase().includes(sp)) &&
    !SAFE_PROCESSES.has(p.name.toLowerCase()),
  );

  const { error: insertError } = await supabase
    .from('agent_processes')
    .insert({
      agent_id: agentId,
      tenant_id: tenantId,
      processes,
      services,
      total_processes: totalProcesses,
      total_services: totalServices,
      services_running: servicesRunning,
      services_stopped: servicesStopped,
      new_processes: newProcesses,
      suspicious_processes: suspiciousProcesses,
      collected_at: new Date().toISOString(),
    });

  if (insertError) {
    logger.error(`[${requestId}] Error inserting process data`, insertError);
    return new Response(JSON.stringify({ error: 'Failed to save process data' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  // Create alert if suspicious processes detected
  if (suspiciousProcesses.length > 0) {
    const suspNames = suspiciousProcesses.map(p => p.name).join(', ');
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId,
      agent_id: agentId,
      alert_type: 'suspicious_process',
      severity: suspiciousProcesses.length >= 3 ? 'critical' : 'high',
      title: `[Auto] Processos suspeitos detectados`,
      message: `${suspiciousProcesses.length} processo(s) executando de locais suspeitos: ${suspNames}`,
      details: {
        count: suspiciousProcesses.length,
        processes: suspiciousProcesses.slice(0, 10),
        source: 'submit-processes',
      },
    });
  }

  logger.info(`[${requestId}] Process snapshot saved: ${processes.length} processes, ${services.length} services, ${newProcesses.length} new, ${suspiciousProcesses.length} suspicious`);

  return {
    success: true,
    new_processes_detected: newProcesses.length,
    suspicious_processes_detected: suspiciousProcesses.length,
    automation_triggered: 0,
  };
}
