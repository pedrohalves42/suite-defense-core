/**
 * cleanup-stuck-jobs -> PROXY to cleanup-router
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

serveInternal(async (_req, ctx) => {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/cleanup-router`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ action: 'stuck-jobs' }),
  });
  return await resp.json();
});
