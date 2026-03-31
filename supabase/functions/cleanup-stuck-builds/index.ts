/**
 * cleanup-stuck-builds -> PROXY to ops-router
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

serveInternal(async (req, _ctx) => {
  const authHeader = req.headers.get('Authorization');
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ops-router`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };
  headers['Authorization'] = authHeader?.startsWith('Bearer ')
    ? authHeader
    : `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'cleanup:stuck-builds' }),
  });
  return await resp.json();
});
