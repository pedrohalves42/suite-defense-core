/**
 * playbook-router — DEPRECATED: Thin proxy to ops-gateway
 * Use ops-gateway with "playbook:*" namespace instead.
 * Kept for backward compatibility during migration.
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';
import { logger } from '../_shared/logger.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  try {
    const body = await req.json();
    const action = body.action as string;
    if (!action) return new Response(JSON.stringify({ error: 'Missing action' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });

    logger.info(`[playbook-router] DEPRECATED proxy → ops-gateway playbook:${action}`);

    const headers: Record<string, string> = { 'Content-Type': 'application/json' };
    for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'x-cron-source']) {
      const v = req.headers.get(name); if (v) headers[name] = v;
    }

    const response = await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/ops-gateway`, {
      method: 'POST', headers,
      body: JSON.stringify({ action: `playbook:${action}`, payload: body.payload || {} }),
      timeoutMs: 45000,
    });

    const responseData = await response.text();
    return new Response(responseData, { status: response.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' } });
  } catch (err) {
    logger.error('[playbook-router] Error:', err);
    return new Response(JSON.stringify({ error: err instanceof Error ? err.message : 'Unknown' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
