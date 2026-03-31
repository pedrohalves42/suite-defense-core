/**
 * cleanup-stuck-builds -> PROXY to cleanup-router
 * Migrated to serveInternal middleware (accepts both internal + JWT)
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

serveInternal(async (req, ctx) => {
  const authHeader = req.headers.get('Authorization');
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-router`;
  const headers: Record<string, string> = { 'Content-Type': 'application/json' };

  // Forward JWT if present, otherwise service_role is already used by serveInternal
  if (authHeader?.startsWith('Bearer ')) {
    headers['Authorization'] = authHeader;
  } else {
    headers['Authorization'] = `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}`;
  }

  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers,
    body: JSON.stringify({ action: 'stuck-builds' }),
  });
  return await resp.json();
});
