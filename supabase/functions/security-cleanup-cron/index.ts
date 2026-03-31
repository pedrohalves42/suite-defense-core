/**
 * security-cleanup-cron -> PROXY to ops-router
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

serveInternal(async (_req) => {
  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ops-router`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': `Bearer ${Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')}` },
    body: JSON.stringify({ action: 'cleanup:security' }),
  });
  return await resp.json();
});
