/**
 * Handler: vulnerability findings submission (migrated from submit-vuln-findings)
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../logger.ts';

interface VulnFinding {
  severity: string;
  check_key: string;
  title: string;
  description?: string;
  remediation?: string;
}

export async function handleVulnFindings(
  supabase: any,
  agentId: string,
  _agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { agent_id, findings } = body as { agent_id?: string; findings?: VulnFinding[] };

  const effectiveAgentId = agent_id || agentId;

  if (!Array.isArray(findings) || findings.length === 0) {
    return { success: true, upserted: 0 };
  }

  logger.info(`[${requestId}] Storing ${findings.length} vuln findings`);

  // Batch upsert instead of N+1 loop
  const rows = findings.map(finding => ({
    tenant_id: tenantId,
    agent_id: effectiveAgentId,
    severity: finding.severity,
    check_key: finding.check_key,
    title: finding.title,
    description: finding.description || null,
    remediation: finding.remediation || null,
    last_seen_at: new Date().toISOString(),
  }));

  const { error: upsertError } = await supabase
    .from('vuln_findings')
    .upsert(rows, { onConflict: 'agent_id,check_key' });

  if (upsertError) {
    logger.error(`[${requestId}] Failed to upsert findings`, upsertError);
    return new Response(JSON.stringify({ error: 'Failed to store findings' }), {
      status: 500, headers: { 'Content-Type': 'application/json' },
    });
  }

  return { success: true, upserted: findings.length };
}
