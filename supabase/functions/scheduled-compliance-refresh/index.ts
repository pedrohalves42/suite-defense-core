/**
 * scheduled-compliance-refresh - Recalculates compliance scores for active tenants
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  const { data: tenants, error: tenantErr } = await supabase
    .from('tenants')
    .select('id')
    .eq('status', 'active');

  if (tenantErr) {
    logger.error(`[${requestId}] Failed to fetch tenants:`, tenantErr);
    return new Response(
      JSON.stringify({ error: 'Failed to fetch tenants' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const results: { tenant_id: string; status: string; error?: string }[] = [];

  for (const tenant of tenants || []) {
    try {
      const { count } = await supabase
        .from('agents')
        .select('*', { count: 'exact', head: true })
        .eq('tenant_id', tenant.id)
        .not('status', 'in', '("archived","deleted")');

      if (!count || count === 0) {
        results.push({ tenant_id: tenant.id, status: 'skipped' });
        continue;
      }

      const { error: fnErr } = await supabase.functions.invoke('calculate-compliance', {
        body: { tenant_id: tenant.id },
      });

      results.push({
        tenant_id: tenant.id,
        status: fnErr ? 'error' : 'ok',
        ...(fnErr ? { error: fnErr.message } : {}),
      });
    } catch (err) {
      results.push({ tenant_id: tenant.id, status: 'error', error: String(err) });
    }
  }

  return {
    requestId,
    elapsed_ms: Date.now() - startedAt,
    total: results.length,
    ok: results.filter(r => r.status === 'ok').length,
    skipped: results.filter(r => r.status === 'skipped').length,
    errors: results.filter(r => r.status === 'error').length,
    details: results,
  };
});
