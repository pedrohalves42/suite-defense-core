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

      logger.info(`[${requestId}] [SCAN-VULNS] Batch scanning ${agents.length} agents`);

      let totalVulns = 0;
      let agentsScanned = 0;
      const results: { agent_id: string; agent_name: string; vulns_found: number }[] = [];

      for (const agent of agents) {
        try {
          const scanResult = await scanAgentVulnerabilities(supabase, agent.id, agent.tenant_id, requestId);
          totalVulns += scanResult.vulnerabilities_found;
          agentsScanned++;
          results.push({ agent_id: agent.id, agent_name: agent.agent_name, vulns_found: scanResult.vulnerabilities_found });
        } catch (agentError) {
          logger.error(`[${requestId}] [SCAN-VULNS] Error scanning agent ${agent.id}:`, agentError);
        }
      }

      // Trigger playbooks for critical vulnerabilities
      if (totalVulns > 0) {
        const criticalAgents = results.filter(r => r.vulns_found > 0);
        for (const agentResult of criticalAgents.slice(0, 5)) {
          try {
            const { data: criticalVulns } = await supabase
              .from('vuln_findings')
              .select('id, severity')
              .eq('agent_id', agentResult.agent_id)
              .eq('severity', 'CRITICAL')
              .limit(1);

            if (criticalVulns && criticalVulns.length > 0) {
              await supabase.functions.invoke('evaluate-playbook-triggers', {
                body: {
                  tenant_id: tenantId,
                  trigger_type: 'vulnerability_critical',
                  agent_id: agentResult.agent_id,
                  context: { vulns_found: agentResult.vulns_found, agent_name: agentResult.agent_name }
                }
              });
            }
          } catch (triggerError) {
            logger.error(`[${requestId}] [SCAN-VULNS] Error triggering playbook:`, triggerError);
          }
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

    const { data: software, error: softwareError } = await supabase
      .from('software_inventory')
      .select('name, version, vendor')
      .eq('agent_id', agent_id)
      .limit(200);

    if (softwareError) throw new Error(softwareError.message || 'Failed to fetch software inventory');

    if (!software || software.length === 0) {
      return new Response(
        JSON.stringify({ success: true, message: 'No software inventory to scan', vulnerabilities_found: 0, scan_method: 'dynamic_nvd' }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[${requestId}] [SCAN-VULNS] Found ${software.length} software items`);

    const softwareKeywords = new Set<string>();
    const softwareMap = new Map<string, SoftwareItem[]>();

    for (const item of software as SoftwareItem[]) {
      const name = item.name?.toLowerCase() || '';
      const keywords = extractKeywords(name);
      keywords.forEach(kw => {
        softwareKeywords.add(kw);
        if (!softwareMap.has(kw)) softwareMap.set(kw, []);
        softwareMap.get(kw)!.push(item);
      });
    }

    const vulnerabilities: Array<Record<string, unknown>> = [];
    const processedCVEs = new Set<string>();

    for (const keyword of Array.from(softwareKeywords).slice(0, 30)) {
      const { data: cves, error: cveError } = await supabase
        .from('cve_database')
        .select('*')
        .or(`affected_products.cs.{${keyword}},description.ilike.%${keyword}%,cpe_matches.cs.{${keyword}}`)
        .gte('cvss_score', 4.0)
        .order('cvss_score', { ascending: false })
        .limit(50);

      if (cveError) {
        logger.info(`[${requestId}] [SCAN-VULNS] Error searching CVEs for "${keyword}":`, cveError.message);
        continue;
      }

      if (cves && cves.length > 0) {
        for (const cve of cves) {
          if (processedCVEs.has(cve.cve_id)) continue;
          const matchedSoftware = softwareMap.get(keyword) || [];
          for (const sw of matchedSoftware) {
            if (isVersionAffected(sw.version, cve.affected_versions)) {
              processedCVEs.add(cve.cve_id);
              const now = new Date().toISOString();
              vulnerabilities.push({
                agent_id,
                tenant_id: tenantId,
                check_key: cve.cve_id,
                title: `${cve.cve_id}: ${truncate(cve.description, 100)}`,
                description: cve.description,
                severity: normalizeSeverity(cve.severity || getSeverityFromScore(cve.cvss_score)),
                remediation: generateRemediation(sw.name, cve),
                first_seen_at: now,
                last_seen_at: now
              });
              break;
            }
          }
        }
      }
    }

    // Fallback detection
    if (vulnerabilities.length === 0) {
      logger.info(`[${requestId}] [SCAN-VULNS] No dynamic CVEs found, using fallback`);
      const fallbackVulns = scanWithFallback(software as SoftwareItem[], agent_id, tenantId);
      vulnerabilities.push(...fallbackVulns);
    }

    // Store findings
    if (vulnerabilities.length > 0) {
      await supabase.from('vuln_findings').delete().eq('agent_id', agent_id);
      const { error: insertError } = await supabase.from('vuln_findings').insert(vulnerabilities);
      if (insertError) throw insertError;
    }

    return new Response(
      JSON.stringify({
        success: true,
        vulnerabilities_found: vulnerabilities.length,
        software_scanned: software.length,
        keywords_searched: softwareKeywords.size,
        critical_vulns: vulnerabilities.filter(v => v.severity === 'CRITICAL').length,
        high_vulns: vulnerabilities.filter(v => v.severity === 'HIGH').length,
        medium_vulns: vulnerabilities.filter(v => v.severity === 'MEDIUM').length,
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
