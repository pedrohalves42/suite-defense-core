/**
 * get-diagnostic-script — STUB (redirects to public-gateway)
 * Logic inlined into public-gateway Phase 7.
 * Kept as proxy for backward compatibility with existing agent URLs.
 */
import { servePublic } from '../_shared/serve-public.ts';
import { fetchWithTimeout, TIMEOUT_TIERS } from '../_shared/fetch-with-timeout.ts';

servePublic(async (req, ctx) => {
  const gwUrl = `${Deno.env.get('SUPABASE_URL')}/functions/v1/public-gateway`;
  const resp = await fetchWithTimeout(gwUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': ctx.requestId, 'origin': req.headers.get('origin') || '' },
    body: JSON.stringify({ action: 'public:get-diagnostic-script', payload: {} }),
    timeoutMs: TIMEOUT_TIERS.INTERNAL,
  });
  return resp;
});
