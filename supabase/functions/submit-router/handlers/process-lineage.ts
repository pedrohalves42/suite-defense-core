/**
 * Handler: process lineage submission
 * Extracted from submit-process-lineage/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

const SUSPICIOUS_PATTERNS: Array<{ parent: string; child: string; reason: string }> = [
  { parent: 'winword.exe', child: 'cmd.exe', reason: 'Office macro executing command shell' },
  { parent: 'winword.exe', child: 'powershell.exe', reason: 'Office macro executing PowerShell' },
  { parent: 'excel.exe', child: 'cmd.exe', reason: 'Excel macro executing command shell' },
  { parent: 'excel.exe', child: 'powershell.exe', reason: 'Excel macro executing PowerShell' },
  { parent: 'outlook.exe', child: 'cmd.exe', reason: 'Outlook executing command shell' },
  { parent: 'outlook.exe', child: 'powershell.exe', reason: 'Outlook executing PowerShell' },
  { parent: 'mshta.exe', child: 'powershell.exe', reason: 'MSHTA launching PowerShell' },
  { parent: 'wscript.exe', child: 'cmd.exe', reason: 'WScript executing command shell' },
  { parent: 'cscript.exe', child: 'powershell.exe', reason: 'CScript executing PowerShell' },
  { parent: 'explorer.exe', child: 'mshta.exe', reason: 'Explorer launching MSHTA' },
  { parent: 'svchost.exe', child: 'cmd.exe', reason: 'Service host spawning command shell' },
  { parent: 'cmd.exe', child: 'certutil.exe', reason: 'CertUtil abuse for download (LOLBin)' },
  { parent: 'cmd.exe', child: 'bitsadmin.exe', reason: 'BitsAdmin abuse for download (LOLBin)' },
  { parent: 'powershell.exe', child: 'whoami.exe', reason: 'PowerShell reconnaissance (whoami)' },
  { parent: 'powershell.exe', child: 'net.exe', reason: 'PowerShell network reconnaissance' },
  { parent: 'rundll32.exe', child: 'cmd.exe', reason: 'Rundll32 spawning command shell' },
];

const SUSPICIOUS_PROCESSES = new Set([
  'mimikatz.exe', 'lazagne.exe', 'procdump.exe', 'sharphound.exe',
  'bloodhound.exe', 'rubeus.exe', 'covenant.exe', 'psexec.exe',
  'wce.exe', 'fgdump.exe', 'gsecdump.exe', 'pwdump.exe',
]);

interface ProcessEntry {
  name: string; pid: number; ppid: number; parent_name?: string;
  cmd?: string; user?: string; start_time?: string; path?: string; hash?: string;
}

function detectSuspicious(proc: ProcessEntry): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const procName = (proc.name || '').toLowerCase();
  const parentName = (proc.parent_name || '').toLowerCase();

  if (SUSPICIOUS_PROCESSES.has(procName)) reasons.push(`Known offensive tool: ${procName}`);

  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (parentName === pattern.parent && procName === pattern.child) reasons.push(pattern.reason);
  }

  if (procName === 'powershell.exe' && proc.cmd) {
    const cmd = proc.cmd.toLowerCase();
    if (cmd.includes('-encodedcommand') || cmd.includes('-enc ') || cmd.includes('-e ')) reasons.push('Encoded PowerShell command detected');
    if (cmd.includes('downloadstring') || cmd.includes('downloadfile') || cmd.includes('invoke-webrequest')) reasons.push('PowerShell download detected');
    if (cmd.includes('-windowstyle hidden') || cmd.includes('-w hidden')) reasons.push('Hidden PowerShell window');
  }

  if (proc.path) {
    const path = proc.path.toLowerCase();
    if ((path.includes('\\temp\\') || path.includes('\\tmp\\') || path.includes('\\appdata\\local\\temp\\')) && !['msiexec.exe', 'setup.exe'].includes(procName)) {
      reasons.push('Process running from temp directory');
    }
  }

  return { suspicious: reasons.length > 0, reasons };
}

export async function handleProcessLineage(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const processes: ProcessEntry[] = (body.processes as ProcessEntry[]) || [];

  if (!Array.isArray(processes) || processes.length === 0) {
    return { success: true, message: 'No processes to record', inserted: 0 };
  }

  logger.info(`[${requestId}] [submit-process-lineage] Received ${processes.length} processes from ${agentName}`);
  const cappedProcesses = processes.slice(0, 500);
  const records: Array<Record<string, unknown>> = [];
  let suspiciousCount = 0;

  for (const proc of cappedProcesses) {
    if (!proc.name || typeof proc.pid !== 'number') continue;
    const { suspicious, reasons } = detectSuspicious(proc);
    if (suspicious) suspiciousCount++;

    records.push({
      agent_id: agentId, tenant_id: tenantId,
      process_name: proc.name.substring(0, 255), process_id: proc.pid,
      parent_process_id: proc.ppid || null, parent_process_name: proc.parent_name?.substring(0, 255) || null,
      command_line: proc.cmd?.substring(0, 2048) || null, user_name: proc.user?.substring(0, 255) || null,
      start_time: proc.start_time || null, path: proc.path?.substring(0, 1024) || null,
      hash_sha256: proc.hash || null, is_suspicious: suspicious,
      suspicion_reasons: reasons.length > 0 ? reasons : null, collected_at: new Date().toISOString(),
    });
  }

  const batchSize = 100;
  let insertedCount = 0;
  for (let i = 0; i < records.length; i += batchSize) {
    const batch = records.slice(i, i + batchSize);
    const { error } = await supabase.from('agent_process_lineage').insert(batch);
    if (error) logger.error(`[${requestId}] Error inserting process batch:`, error.message);
    else insertedCount += batch.length;
  }

  if (suspiciousCount > 0) {
    const suspiciousProcs = records.filter(r => r.is_suspicious);
    await supabase.from('system_alerts').insert({
      tenant_id: tenantId, agent_id: agentId, alert_type: 'suspicious_process',
      severity: suspiciousCount >= 3 ? 'critical' : 'high',
      title: `${suspiciousCount} processo(s) suspeito(s) detectado(s)`,
      description: `Agente ${agentName} reportou ${suspiciousCount} processos com padroes suspeitos: ${suspiciousProcs.map(p => p.process_name).join(', ')}`,
      metadata: {
        suspicious_processes: suspiciousProcs.slice(0, 10).map(p => ({
          name: p.process_name, parent: p.parent_process_name,
          reasons: p.suspicion_reasons, cmd: (p.command_line as string)?.substring(0, 200),
        })),
        total_processes: records.length, suspicious_count: suspiciousCount,
      },
    }).catch(e => logger.error(`[${requestId}] Error creating alert:`, e));
  }

  return { success: true, inserted: insertedCount, suspicious_detected: suspiciousCount, total_received: cappedProcesses.length };
}
