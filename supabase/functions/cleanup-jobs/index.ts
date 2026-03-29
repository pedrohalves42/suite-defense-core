/**
 * cleanup-jobs → PROXY to cleanup-router (admin action)
 */
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return new Response(JSON.stringify({ error: 'Unauthorized' }), { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
  }

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body */ }

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-router`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({ action: 'jobs', ...body }),
  });
  return new Response(await resp.text(), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
