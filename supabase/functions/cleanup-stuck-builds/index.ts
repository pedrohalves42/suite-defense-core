/**
 * cleanup-stuck-builds → PROXY to cleanup-router
 */
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  // Accept both internal and JWT auth (frontend calls this too)
  const authHeader = req.headers.get('Authorization');
  const isJwtCall = authHeader?.startsWith('Bearer ');
  
  if (!isJwtCall) {
    const authError = assertInternalCaller(req);
    if (authError) return authError;
  }

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-router`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  
  // Forward JWT if present, otherwise use service_role
  if (isJwtCall) {
    headers['Authorization'] = authHeader!;
  } else {
    headers['Authorization'] = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  }

  const resp = await fetch(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'stuck-builds' }),
  });
  return new Response(await resp.text(), { status: resp.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } });
});
