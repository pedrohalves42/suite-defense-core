/**
 * Scheduled Compliance Refresh - Migrated to assertInternalCaller
 * Cron job that recalculates compliance scores for all active tenants.
 */
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    const { data: tenants, error: tenantErr } = await supabase
      .from('tenants')
      .select('id')
      .eq('status', 'active');

    if (tenantErr) {
      logger.error(`[${requestId}] Failed to fetch tenants:`, tenantErr);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch tenants' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
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

    const summary = {
      requestId,
      elapsed_ms: Date.now() - startedAt,
      total: results.length,
      ok: results.filter(r => r.status === 'ok').length,
      skipped: results.filter(r => r.status === 'skipped').length,
      errors: results.filter(r => r.status === 'error').length,
      details: results,
    };

    logger.info(`[${requestId}] Compliance refresh complete`);

    return new Response(JSON.stringify(summary), {
      status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (err) {
    logger.error(`[${requestId}] Fatal error:`, err);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
