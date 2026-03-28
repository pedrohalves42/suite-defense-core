/**
 * auto-cleanup-jobs → PROXY to cleanup-router
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { corsHeaders } from '../_shared/cors.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });
  const authError = assertInternalCaller(req);
  if (authError) return authError;

  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { /* empty body is ok */ }

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-router`;
  const resp = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ action: 'auto-cleanup-jobs', ...body }),
  });
  return new Response(await resp.text(), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
