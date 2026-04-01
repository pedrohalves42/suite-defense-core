/**
 * report-router — DEPRECATED: Thin proxy to ops-gateway
 * Use ops-gateway with "report:*" namespace instead.
 * Migrated to servePublic middleware.
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const ProxySchema = z.object({
  action: z.string().min(1).max(200),
  payload: z.record(z.unknown()).optional(),
});

const FORWARDED_HEADERS = ['Authorization', 'apikey', 'X-Internal-Secret', 'X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce'];

servePublic(async (req, ctx) => {
  const { requestId, body } = ctx;
  const origin = req.headers.get('origin');

  const parsed = ProxySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Missing action', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
  const { action, payload } = parsed.data;

  logger.info(`[report-router][${requestId}] DEPRECATED proxy → ops-gateway report:${action}`);

  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  for (const name of FORWARDED_HEADERS) {
    const v = req.headers.get(name); if (v) headers[name] = v;
  }

  const response = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/ops-gateway`, {
    method: 'POST', headers,
    body: JSON.stringify({ action: `report:${action}`, payload: payload || {} }),
    timeoutMs: 45000,
  });

  const responseData = await response.text();
  return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
});
