/**
 * cleanup-jobs -> PROXY to ops-router (admin action)
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

serveTenant(async (req, ctx) => {
  const { body } = ctx;
  const authHeader = req.headers.get('Authorization') || '';

  const url = `${Deno.env.get('SUPABASE_URL')}/functions/v1/ops-router`;
  const resp = await fetchWithTimeout(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': authHeader },
    body: JSON.stringify({ action: 'cleanup:jobs', payload: body || {} }),
  });
  return await resp.json();
}, { skipTenantValidation: true, methods: ['POST'] });
