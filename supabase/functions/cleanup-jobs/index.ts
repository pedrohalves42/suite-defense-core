/**
 * cleanup-jobs → PROXY to cleanup-router (admin action)
 */
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-router`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({ action: 'jobs', ...body }),
  });
  return new Response(await resp.text(), { status: resp.status, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
});
