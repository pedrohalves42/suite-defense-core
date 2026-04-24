/**
 * get-latest-agent-script — STUB (redirects to public-gateway)
 * Logic inlined into public-gateway Phase 7.
 * Kept as proxy for backward compatibility with existing agent URLs.
 */
import { servePublic } from '../_shared/serve-public.ts';
import { fetchWithTimeout, TIMEOUT_TIERS } from '../_shared/fetch-with-timeout.ts';

servePublic(async (req, ctx) => {
  const url = new URL(req.url);
  const payload: Record<string, string> = {};
  for (const [key, value] of url.searchParams.entries()) {
    payload[key] = value;
  }

  const supabaseUrl = Deno.env.get('SUPABASE_URL') || '';
  const gwUrl = `${supabaseUrl}/functions/v1/public-gateway`;
  
  console.log(`[get-latest-agent-script] Proxying to: ${gwUrl} with action: public:get-latest-agent-script`);
  
  const resp = await fetchWithTimeout(gwUrl, {
    method: 'POST',
    headers: { 
      'Content-Type': 'application/json', 
      'X-Request-ID': ctx.requestId, 
      'origin': req.headers.get('origin') || '',
      'Authorization': `Bearer ${Deno.env.get('SUPABASE_ANON_KEY')}` // Ensure we can call our own gateway
    },
    body: JSON.stringify({ action: 'public:get-latest-agent-script', payload }),
    timeoutMs: TIMEOUT_TIERS.INTERNAL,
  });
  return resp;
});
