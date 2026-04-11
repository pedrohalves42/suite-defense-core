/**
 * submit-software-inventory — PROXY STUB
 * Forwards to submit-hmac-router with type: "software-inventory"
 * Kept for backward compatibility with agents using the legacy URL.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';

serveAgent(async (_req, ctx) => {
  const body = ctx.body as Record<string, unknown>;
  body.type = 'software-inventory';

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/submit-hmac-router`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`,
      'X-Agent-Token': ctx.req.headers.get('X-Agent-Token') || '',
      'X-HMAC-Signature': ctx.req.headers.get('X-HMAC-Signature') || '',
      'X-Timestamp': ctx.req.headers.get('X-Timestamp') || '',
      'X-Trace-ID': ctx.requestId,
    },
    body: ctx.rawBody || JSON.stringify(body),
  });

  return new Response(await resp.text(), {
    status: resp.status,
    headers: { 'Content-Type': 'application/json' },
  });
}, { hmacVerify: false });
