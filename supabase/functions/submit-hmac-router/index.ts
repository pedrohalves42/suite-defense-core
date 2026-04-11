/**
 * submit-hmac-router — Consolidated HMAC-verified agent telemetry submission endpoint
 * 
 * Phase 1: Consolidates submit-antivirus-status, submit-software-inventory,
 * submit-web-activity, submit-vuln-findings into a single edge function.
 * 
 * Phase 2 (future): submit-system-metrics, submit-processes, submit-rollback-event
 * 
 * Usage: POST /submit-hmac-router
 * Body: { "type": "antivirus-status" | "software-inventory" | "web-activity" | "vuln-findings", ...payload }
 * Headers: X-Agent-Token, X-HMAC-Signature, X-Timestamp
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

import { handleAntivirusStatus } from './handlers/antivirus-status.ts';
import { handleSoftwareInventory } from './handlers/software-inventory.ts';
import { handleWebActivity } from './handlers/web-activity.ts';
import { handleVulnFindings } from './handlers/vuln-findings.ts';

const RouterSchema = z.object({
  type: z.string().min(1).max(50),
}).passthrough();

type SubmitHandler = (
  supabase: import('https://esm.sh/@supabase/supabase-js@2.74.0').SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
) => Promise<Response | Record<string, unknown>>;

const HANDLERS: Record<string, SubmitHandler> = {
  'antivirus-status':     handleAntivirusStatus,
  'antivirus_status':     handleAntivirusStatus,
  'software-inventory':   handleSoftwareInventory,
  'software_inventory':   handleSoftwareInventory,
  'web-activity':         handleWebActivity,
  'web_activity':         handleWebActivity,
  'vuln-findings':        handleVulnFindings,
  'vuln_findings':        handleVulnFindings,
};

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;

  const parsed = RouterSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({
        error: 'Invalid payload',
        issues: parsed.error.flatten().fieldErrors,
        available: Object.keys(HANDLERS).filter(k => k.includes('-')),
      }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const payload = parsed.data as Record<string, unknown>;
  const type = parsed.data.type;

  const handler = HANDLERS[type];
  if (!handler) {
    return new Response(
      JSON.stringify({
        error: `Unknown submit type: ${type}`,
        available: Object.keys(HANDLERS).filter(k => k.includes('-')),
      }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  logger.info(`[${requestId}] submit-hmac-router: type=${type} agent=${agentId}`);

  const result = await handler(supabase, agentId, agentName || '', tenantId, requestId, payload);
  if (result instanceof Response) return result;
  return new Response(JSON.stringify(result), {
    status: 200,
    headers: { 'Content-Type': 'application/json' },
  });
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-hmac-router', maxRequests: 120, windowMinutes: 60, blockMinutes: 10 },
});
