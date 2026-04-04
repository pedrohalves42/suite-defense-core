/**
 * get-latest-agent-script — STUB (redirects to public-gateway)
 * Logic inlined into public-gateway Phase 7.
 * Kept as proxy for backward compatibility with existing agent URLs.
 */
import { servePublic } from '../_shared/serve-public.ts';

servePublic(async (req, ctx) => {
  const url = new URL(req.url);
  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value;
  }

  const gwUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/public-gateway`;
  const resp = await fetch(gwUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': ctx.requestId, 'origin': req.headers.get('origin') || '' },
    body: JSON.stringify({ action: 'public:get-latest-agent-script', payload }),
  });
  return resp;
});
