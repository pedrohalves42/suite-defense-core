/**
 * submit-vuln-findings — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface VulnFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  check_key: string;
  title: string;
  description?: string;
  remediation?: string;
}

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, body } = ctx;
  const payload = body as { agent_id?: string; findings?: VulnFinding[] };

  if (!payload.agent_id || !Array.isArray(payload.findings)) {
    return new Response(JSON.stringify({ error: 'agent_id and findings are required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!payload.findings.length) {
    return { success: true, upserted: 0 };
  }

  logger.info(`Storing ${payload.findings.length} vuln findings for agent ${agentName}`);

  for (const finding of payload.findings) {
    const { error: upsertError } = await supabase
      .from('vuln_findings')
      .upsert({
        tenant_id: tenantId,
        agent_id: payload.agent_id,
        severity: finding.severity,
        check_key: finding.check_key,
        title: finding.title,
        description: finding.description || null,
        remediation: finding.remediation || null,
        last_seen_at: new Date().toISOString(),
      }, { onConflict: 'agent_id,check_key' });

    if (upsertError) {
      logger.error(`Failed to upsert finding ${finding.check_key}`, upsertError);
    }
  }

  return { success: true, upserted: payload.findings.length };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-vuln-findings', maxRequests: 10, windowMinutes: 60, blockMinutes: 10 },
});
