/**
 * Scan Vulnerabilities - Orchestrator
 * Auth: serveTenant (JWT + tenant isolation)
 * 
 * Core scan logic in scanner.ts, helpers in vuln-helpers.ts
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { scanAgentVulnerabilities } from './scanner.ts';

serveTenant(async (req, ctx) => {
  const origin = req.headers.get("origin");
  const { supabase, tenantId, requestId, body } = ctx;
  const { agent_id, mode } = body;

  try {
    // BATCH MODE
    if (mode === 'batch_all_agents') {
      logger.info(`[${requestId}] [SCAN-VULNS] Starting BATCH scan for tenant ${tenantId}`);

      const { data: agents, error: agentsError } = await supabase
        .from('agents')
        .select('id, tenant_id, agent_name')
        .eq('status', 'active')
        .eq('tenant_id', tenantId)
        .limit(100);

      if (agentsError) throw agentsError;

      if (!agents || agents.length === 0) {
        return new Response(
          JSON.stringify({ success: true, message: 'No active agents to scan', agents_scanned: 0, total_vulnerabilities: 0 }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      let totalVulns = 0;
      let agentsScanned = 0;
      const results: { agent_id: string; agent_name: string; vulns_found: number }[] = [];

      for (const agent of agents) {
        try {
          const scanResult = await scanAgentVulnerabilities(supabase, agent.id, agent.tenant_id, requestId, { mode: 'batch' });
          if (scanResult.vulnerabilities.length > 0) {
            await supabase.from('vuln_findings').upsert(scanResult.vulnerabilities, { onConflict: 'agent_id,check_key' });
          }
          totalVulns += scanResult.vulnerabilities_found;
          agentsScanned++;
          results.push({ agent_id: agent.id, agent_name: agent.agent_name, vulns_found: scanResult.vulnerabilities_found });
        } catch (agentError) {
          logger.error(`[${requestId}] [SCAN-VULNS] Error scanning agent ${agent.id}:`, agentError);
        }
      }

      // Trigger playbooks for critical vulnerabilities
      if (totalVulns > 0) {
        for (const agentResult of results.filter(r => r.vulns_found > 0).slice(0, 5)) {
          try {
            const { data: criticalVulns } = await supabase.from('vuln_findings').select('id, severity').eq('agent_id', agentResult.agent_id).eq('severity', 'CRITICAL').limit(1);
            if (criticalVulns && criticalVulns.length > 0) {
              await supabase.functions.invoke('evaluate-playbook-triggers', {
                body: { tenant_id: tenantId, trigger_type: 'vulnerability_critical', agent_id: agentResult.agent_id, context: { vulns_found: agentResult.vulns_found, agent_name: agentResult.agent_name } }
              });
            }
          } catch (triggerError) { logger.error(`[${requestId}] [SCAN-VULNS] Error triggering playbook:`, triggerError); }
        }
      }

      return new Response(
        JSON.stringify({ success: true, mode: 'batch', agents_scanned: agentsScanned, total_vulnerabilities: totalVulns, results }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // SINGLE AGENT SCAN
    if (!agent_id) {
      return new Response(
        JSON.stringify({ error: 'agent_id required' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[${requestId}] [SCAN-VULNS] Starting scan for agent ${agent_id}`);

    const scanResult = await scanAgentVulnerabilities(supabase, agent_id, tenantId!, requestId, { mode: 'single' });

    // Store findings
    if (scanResult.vulnerabilities.length > 0) {
      await supabase.from('vuln_findings').delete().eq('agent_id', agent_id);
      const { error: insertError } = await supabase.from('vuln_findings').insert(scanResult.vulnerabilities);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        vulnerabilities_found: scanResult.vulnerabilities_found,
        critical_vulns: scanResult.vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high_vulns: scanResult.vulnerabilities.filter(v => v.severity === 'HIGH').length,
        medium_vulns: scanResult.vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
        scan_method: 'dynamic_nvd'
      }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  } catch (error: unknown) {
    const message = error instanceof Error ? error.message : JSON.stringify(error) || 'Unknown error';
    logger.error(`[${requestId}] [SCAN-VULNS] Error:`, message);
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
}, { rateLimit: { maxRequests: 5, windowMinutes: 1 } });
