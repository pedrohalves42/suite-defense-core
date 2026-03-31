/**
 * submit-vuln-findings — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const VulnFindingSchema = z.object({
  severity: z.enum(['low', 'medium', 'high', 'critical']),
  check_key: z.string().min(1).max(255),
  title: z.string().min(1).max(500),
  description: z.string().max(2000).optional(),
  remediation: z.string().max(2000).optional(),
});

const SubmitVulnSchema = z.object({
  agent_id: z.string().uuid(),
  findings: z.array(VulnFindingSchema).max(500),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, body } = ctx;

  const parsed = SubmitVulnSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const payload = parsed.data;

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
