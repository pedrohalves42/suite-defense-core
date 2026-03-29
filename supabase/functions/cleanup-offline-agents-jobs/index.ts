/**
 * cleanup-offline-agents-jobs -> PROXY to cleanup-router
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-router`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ action: 'offline-agents-jobs' }),
  });
  return new Response(await resp.text(), { status: resp.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
});
