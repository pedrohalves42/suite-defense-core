/**
 * submit-endpoint-events — Legacy compatibility stub
 * 
 * The v5.0.15 agent calls this endpoint for EDR telemetry.
 * It was consolidated into submit-router but legacy agents still
 * target /functions/v1/submit-endpoint-events directly.
 * 
 * This stub proxies to submit-router with type: "endpoint-events".
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { fetchWithTimeout, TIMEOUT_TIERS } from '../_shared/fetch-with-timeout.ts';

serveAgent(async (_req, ctx) => {
  const { agentId, agentName, tenantId, requestId, body } = ctx;

  logger.info(`[${requestId}] submit-endpoint-events: legacy proxy for agent ${agentId}`);

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const INTERNAL_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET') || '';

  const routerPayload = {
    ...body,
    type: 'endpoint-events',
    _router_agent_id: agentId,
    _router_tenant_id: tenantId,
  };

  try {
    const response = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/submit-router`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'X-Internal-Secret': INTERNAL_SECRET,
        'X-Agent-Token': _req.headers.get('X-Agent-Token') || '',
        'X-Request-ID': requestId,
      },
      timeoutMs: TIMEOUT_TIERS.INTERNAL,
      body: JSON.stringify(routerPayload),
    });

    const result = await response.text();
    try {
      return JSON.parse(result);
    } catch {
      return { success: response.ok, raw: result };
    }
  } catch (err) {
    logger.error(`[${requestId}] submit-endpoint-events proxy failed`, {
      error: (err as Error).message,
    });
    return new Response(
      JSON.stringify({ error: 'Internal proxy error', message: (err as Error).message }),
      { status: 502, headers: { 'Content-Type': 'application/json' } },
    );
  }
});
