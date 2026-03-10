/**
 * submit-process-lineage Edge Function (P1)
 * 
 * Receives process tree data from agents and stores it for EDR visibility.
 * Detects suspicious patterns: unusual parent-child relationships, 
 * known attack patterns (e.g., cmd.exe spawned by Word).
 * 
 * Authentication: X-Agent-Token (agent-auth)
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateAgent } from '../_shared/agent-auth.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';

// Known suspicious parent-child process patterns (EDR heuristics)
const SUSPICIOUS_PATTERNS: Array<{ parent: string; child: string; reason: string }> = [
  { parent: 'winword.exe', child: 'cmd.exe', reason: 'Office macro executing command shell' },
  { parent: 'winword.exe', child: 'powershell.exe', reason: 'Office macro executing PowerShell' },
  { parent: 'excel.exe', child: 'cmd.exe', reason: 'Excel macro executing command shell' },
  { parent: 'excel.exe', child: 'powershell.exe', reason: 'Excel macro executing PowerShell' },
  { parent: 'outlook.exe', child: 'cmd.exe', reason: 'Outlook executing command shell' },
  { parent: 'outlook.exe', child: 'powershell.exe', reason: 'Outlook executing PowerShell' },
  { parent: 'mshta.exe', child: 'powershell.exe', reason: 'MSHTA launching PowerShell (living off the land)' },
  { parent: 'wscript.exe', child: 'cmd.exe', reason: 'WScript executing command shell' },
  { parent: 'cscript.exe', child: 'powershell.exe', reason: 'CScript executing PowerShell' },
  { parent: 'explorer.exe', child: 'mshta.exe', reason: 'Explorer launching MSHTA (potential phishing)' },
  { parent: 'svchost.exe', child: 'cmd.exe', reason: 'Service host spawning command shell' },
  { parent: 'cmd.exe', child: 'certutil.exe', reason: 'CertUtil abuse for download (LOLBin)' },
  { parent: 'cmd.exe', child: 'bitsadmin.exe', reason: 'BitsAdmin abuse for download (LOLBin)' },
  { parent: 'powershell.exe', child: 'whoami.exe', reason: 'PowerShell reconnaissance (whoami)' },
  { parent: 'powershell.exe', child: 'net.exe', reason: 'PowerShell network reconnaissance' },
  { parent: 'rundll32.exe', child: 'cmd.exe', reason: 'Rundll32 spawning command shell' },
];

// Suspicious process names (standalone detection)
const SUSPICIOUS_PROCESSES = new Set([
  'mimikatz.exe', 'lazagne.exe', 'procdump.exe', 'sharphound.exe',
  'bloodhound.exe', 'rubeus.exe', 'covenant.exe', 'psexec.exe',
  'wce.exe', 'fgdump.exe', 'gsecdump.exe', 'pwdump.exe',
]);

interface ProcessEntry {
  name: string;
  pid: number;
  ppid: number;
  parent_name?: string;
  cmd?: string;
  user?: string;
  start_time?: string;
  path?: string;
  hash?: string;
}

function detectSuspicious(proc: ProcessEntry): { suspicious: boolean; reasons: string[] } {
  const reasons: string[] = [];
  const procName = (proc.name || '').toLowerCase();
  const parentName = (proc.parent_name || '').toLowerCase();

  // Check known malware tools
  if (SUSPICIOUS_PROCESSES.has(procName)) {
    reasons.push(`Known offensive tool: ${procName}`);
  }

  // Check suspicious parent-child patterns
  for (const pattern of SUSPICIOUS_PATTERNS) {
    if (parentName === pattern.parent && procName === pattern.child) {
      reasons.push(pattern.reason);
    }
  }

  // Check for encoded PowerShell commands
  if (procName === 'powershell.exe' && proc.cmd) {
    const cmd = proc.cmd.toLowerCase();
    if (cmd.includes('-encodedcommand') || cmd.includes('-enc ') || cmd.includes('-e ')) {
      reasons.push('Encoded PowerShell command detected');
    }
    if (cmd.includes('downloadstring') || cmd.includes('downloadfile') || cmd.includes('invoke-webrequest')) {
      reasons.push('PowerShell download detected');
    }
    if (cmd.includes('-windowstyle hidden') || cmd.includes('-w hidden')) {
      reasons.push('Hidden PowerShell window');
    }
  }

  // Check for processes running from temp directories
  if (proc.path) {
    const path = proc.path.toLowerCase();
    if (path.includes('\\temp\\') || path.includes('\\tmp\\') || path.includes('\\appdata\\local\\temp\\')) {
      if (!['msiexec.exe', 'setup.exe'].includes(procName)) {
        reasons.push('Process running from temp directory');
      }
    }
  }

  return { suspicious: reasons.length > 0, reasons };
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // Authenticate agent
    const authResult = await authenticateAgent(supabase, req, 'submit-process-lineage');
    if (!authResult.success) return authResult.response;
    const { agent } = authResult;

    // Rate limiting
    const rateLimitKey = `process-lineage:${agent.agent_name}`;
    const rlResult = await checkRateLimit(supabase, rateLimitKey, 'submit-process-lineage', {
      maxRequests: 10,
      windowMinutes: 60,
    });
    if (!rlResult.allowed) {
      return new Response(
        JSON.stringify({ error: 'Rate limit exceeded' }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body = await req.json();
    const processes: ProcessEntry[] = body.processes || [];

    if (!Array.isArray(processes) || processes.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No processes to record', inserted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] [submit-process-lineage] Received ${processes.length} processes from ${agent.agent_name}`);

    // Cap at 500 processes per submission
    const cappedProcesses = processes.slice(0, 500);

    // Detect suspicious patterns and prepare records
    const records: Array<Record<string, unknown>> = [];
    let suspiciousCount = 0;

    for (const proc of cappedProcesses) {
      // Validate required fields
      if (!proc.name || typeof proc.pid !== 'number') continue;

      const { suspicious, reasons } = detectSuspicious(proc);
      if (suspicious) suspiciousCount++;

      records.push({
        agent_id: agent.id,
        tenant_id: agent.tenant_id,
        process_name: proc.name.substring(0, 255),
        process_id: proc.pid,
        parent_process_id: proc.ppid || null,
        parent_process_name: proc.parent_name?.substring(0, 255) || null,
        command_line: proc.cmd?.substring(0, 2048) || null,
        user_name: proc.user?.substring(0, 255) || null,
        start_time: proc.start_time || null,
        path: proc.path?.substring(0, 1024) || null,
        hash_sha256: proc.hash || null,
        is_suspicious: suspicious,
        suspicion_reasons: reasons.length > 0 ? reasons : null,
        collected_at: new Date().toISOString(),
      });
    }

    // Batch insert
    const batchSize = 100;
    let insertedCount = 0;

    for (let i = 0; i < records.length; i += batchSize) {
      const batch = records.slice(i, i + batchSize);
      const { error } = await supabase
        .from('agent_process_lineage')
        .insert(batch);

      if (error) {
        console.error(`[${requestId}] Error inserting process batch:`, error.message);
      } else {
        insertedCount += batch.length;
      }
    }

    // If suspicious processes found, create system alert
    if (suspiciousCount > 0) {
      const suspiciousProcs = records.filter(r => r.is_suspicious);
      await supabase.from('system_alerts').insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        alert_type: 'suspicious_process',
        severity: suspiciousCount >= 3 ? 'critical' : 'high',
        title: `${suspiciousCount} processo(s) suspeito(s) detectado(s)`,
        description: `Agente ${agent.agent_name} reportou ${suspiciousCount} processos com padrões suspeitos: ${suspiciousProcs.map(p => p.process_name).join(', ')}`,
        metadata: {
          suspicious_processes: suspiciousProcs.slice(0, 10).map(p => ({
            name: p.process_name,
            parent: p.parent_process_name,
            reasons: p.suspicion_reasons,
            cmd: (p.command_line as string)?.substring(0, 200),
          })),
          total_processes: records.length,
          suspicious_count: suspiciousCount,
        },
      }).catch(e => console.error(`[${requestId}] Error creating alert:`, e));
    }

    const result = {
      success: true,
      inserted: insertedCount,
      suspicious_detected: suspiciousCount,
      total_received: cappedProcesses.length,
    };

    console.log(`[${requestId}] [submit-process-lineage] Done:`, JSON.stringify(result));

    return new Response(JSON.stringify(result), {
      status: 200,
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });

  } catch (error) {
    const errorMsg = error instanceof Error ? error.message : 'Unknown error';
    console.error(`[${requestId}] [submit-process-lineage] Fatal:`, errorMsg);
    return new Response(
      JSON.stringify({ success: false, error: errorMsg }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
