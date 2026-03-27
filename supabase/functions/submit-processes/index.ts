import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { hashToken } from '../_shared/token-hash.ts';
import { corsSecurityHeaders, secureJsonResponse, secureErrorResponse, secureCorsPreflightResponse } from '../_shared/security-headers.ts';
import { logger } from '../_shared/logger.ts';

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

interface ProcessPayload {
  processes: ProcessEntry[];
  services: ServiceEntry[];
  total_processes?: number;
  total_services?: number;
  services_running?: number;
  services_stopped?: number;
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return secureCorsPreflightResponse();
  }

  if (req.method !== 'POST') {
    return secureErrorResponse('Method not allowed', 405);
  }

  try {
    const agentToken = req.headers.get('x-agent-token');

    if (!agentToken) {
      return secureErrorResponse('Missing agent token', 401);
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Validate agent token via hash
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, tenant_id)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      logger.error('Invalid agent token:', tokenError);
      return secureErrorResponse('Invalid or expired agent token', 401);
    }

    const agentId = tokenData.agent_id;
    const tenantId = (tokenData.agents as any).tenant_id;

    const payload: ProcessPayload = await req.json();

    // Limit array sizes to prevent abuse
    const processes = (payload.processes || []).slice(0, 500);
    const services = (payload.services || []).slice(0, 300);

    // Detect new/suspicious processes by comparing with last snapshot
    let newProcesses: ProcessEntry[] = [];
    let suspiciousProcesses: ProcessEntry[] = [];

    const { data: lastSnapshot } = await supabase
      .from('agent_processes')
      .select('processes')
      .eq('agent_id', agentId)
      .order('collected_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (lastSnapshot?.processes) {
      const previousNames = new Set(
        (lastSnapshot.processes as ProcessEntry[]).map(p => p.name.toLowerCase())
      );
      newProcesses = processes.filter(p => !previousNames.has(p.name.toLowerCase()));
    }

    // Simple heuristic: processes running from temp/download folders
    const suspiciousPaths = ['\\temp\\', '\\tmp\\', '\\downloads\\', '\\appdata\\local\\temp\\'];
    
    // Whitelist: known safe processes that may run from flagged paths
    const safeProcesses = [
      'teamviewer_service.exe', 'teamviewer.exe',
      'anydesk.exe', 'anydesk service.exe',
      'chrome.exe', 'msedge.exe', 'firefox.exe', 'brave.exe',
      'code.exe', 'devenv.exe',
      'onedrive.exe', 'dropbox.exe',
      'slack.exe', 'teams.exe', 'zoom.exe',
      'windowsdefender.exe', 'msmpeng.exe',
      'svchost.exe', 'explorer.exe', 'taskhostw.exe',
    ];
    
    suspiciousProcesses = processes.filter(p =>
      p.command_line && 
      suspiciousPaths.some(sp => p.command_line!.toLowerCase().includes(sp)) &&
      !safeProcesses.includes(p.name.toLowerCase())
    );

    const { error: insertError } = await supabase
      .from('agent_processes')
      .insert({
        agent_id: agentId,
        tenant_id: tenantId,
        processes,
        services,
        total_processes: payload.total_processes ?? processes.length,
        total_services: payload.total_services ?? services.length,
        services_running: payload.services_running ?? services.filter(s => s.status === 'Running').length,
        services_stopped: payload.services_stopped ?? services.filter(s => s.status === 'Stopped').length,
        new_processes: newProcesses,
        suspicious_processes: suspiciousProcesses,
        collected_at: new Date().toISOString(),
      });

    if (insertError) {
      logger.error('Error inserting process data:', insertError);
      return secureErrorResponse('Failed to save process data', 500);
    }

    // Cleanup old snapshots (keep last 7 days)
    await supabase
      .from('agent_processes')
      .delete()
      .eq('agent_id', agentId)
      .lt('collected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString());

    // ── Bloco A: Create alert if suspicious processes detected ──
    if (suspiciousProcesses.length > 0) {
      const suspNames = suspiciousProcesses.map(p => p.name).join(', ');
      await supabase
        .from('system_alerts')
        .insert({
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

    // ── Bloco A: Trigger process_anomaly automation rules ──
    let automationTriggered = 0;
    if (suspiciousProcesses.length > 0 || newProcesses.length > 5) {
      try {
        const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
        const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        const evalUrl = `${supabaseUrl}/functions/v1/evaluate-automation-rules`;
        const evalResponse = await fetch(evalUrl, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${supabaseServiceKey}`,
          },
          body: JSON.stringify({ tenant_id: tenantId }),
        });
        if (evalResponse.ok) {
          const result = await evalResponse.json();
          automationTriggered = result.triggered || 0;
        }
      } catch (e) {
        logger.warn('Automation evaluation failed (non-blocking)', e);
      }
    }

    logger.info(`Process snapshot saved for agent ${agentId}: ${processes.length} processes, ${services.length} services, ${newProcesses.length} new, ${suspiciousProcesses.length} suspicious, ${automationTriggered} automations`);

    return secureJsonResponse({
      success: true,
      new_processes_detected: newProcesses.length,
      suspicious_processes_detected: suspiciousProcesses.length,
      automation_triggered: automationTriggered,
    });

  } catch (error) {
    logger.error('Error in submit-processes:', error);
    return secureErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
