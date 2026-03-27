import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';

/**
 * CONSOLIDATED security-monitor (COST-OPT v10)
 * 
 * Replaces 2 individual security cron functions:
 *   - check-credential-rotation (daily)
 *   - check-expiring-enrollment-keys (hourly)
 * 
 * Note: check-credential-leaks and check-failed-logins remain separate
 * because they are on-demand/user-triggered, not cron.
 * 
 * Auth: Internal (service_role / cron / X-Internal-Secret)
 * Schedule: Every 1 hour via pg_cron
 */

interface SecurityResult {
  credential_rotation: { tokens_warning: number; tokens_expired: number };
  expiring_keys: { keys_found: number; notifications_sent: number };
  duration_ms: number;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') return new Response(null, { headers: corsHeaders });

  const authError = assertInternalCaller(req);
  if (authError) return authError;

  const startedAt = Date.now();
  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  );

  const result: SecurityResult = {
    credential_rotation: { tokens_warning: 0, tokens_expired: 0 },
    expiring_keys: { keys_found: 0, notifications_sent: 0 },
    duration_ms: 0,
  };

  try {
    const [rotationResult, keysResult] = await Promise.allSettled([
      // ── 1. Credential Rotation Check ──
      (async () => {
        // Find agent tokens older than rotation policy (default 90 days)
        const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
        const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

        const { data: expiredTokens } = await supabase
          .from('agent_tokens')
          .select('id, agent_id, tenant_id')
          .lt('rotated_at', ninetyDaysAgo)
          .eq('is_active', true)
          .limit(200);
        result.credential_rotation.tokens_expired = expiredTokens?.length || 0;

        const { data: warningTokens } = await supabase
          .from('agent_tokens')
          .select('id, agent_id, tenant_id')
          .lt('rotated_at', sixtyDaysAgo)
          .gte('rotated_at', ninetyDaysAgo)
          .eq('is_active', true)
          .limit(200);
        result.credential_rotation.tokens_warning = warningTokens?.length || 0;

        // Create system alerts for expired tokens
        if (expiredTokens?.length) {
          const tenantIds = [...new Set(expiredTokens.map(t => t.tenant_id))];
          for (const tenantId of tenantIds) {
            const count = expiredTokens.filter(t => t.tenant_id === tenantId).length;
            await supabase.from('system_alerts').upsert({
              tenant_id: tenantId,
              type: 'credential_rotation_overdue',
              severity: 'high',
              message: `${count} agent token(s) overdue for rotation (>90 days)`,
              metadata: { count, check: 'security-monitor' },
            }, { onConflict: 'tenant_id,type' });
          }
        }
      })(),

      // ── 2. Expiring Enrollment Keys ──
      (async () => {
        const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
        const now = new Date().toISOString();

        const { data: expiringKeys, error } = await supabase
          .from('enrollment_keys')
          .select('id, key, expires_at, description, tenant_id')
          .lt('expires_at', oneHourFromNow)
          .gt('expires_at', now)
          .is('expiration_notified_at', null)
          .eq('is_active', true);

        if (error) { logger.error('[security-monitor] expiring-keys error:', error.message); return; }
        result.expiring_keys.keys_found = expiringKeys?.length || 0;

        if (expiringKeys?.length) {
          // Mark as notified
          const keyIds = expiringKeys.map(k => k.id);
          await supabase
            .from('enrollment_keys')
            .update({ expiration_notified_at: now })
            .in('id', keyIds);
          result.expiring_keys.notifications_sent = keyIds.length;

          // Create system alerts per tenant
          const byTenant = new Map<string, number>();
          expiringKeys.forEach(k => byTenant.set(k.tenant_id, (byTenant.get(k.tenant_id) || 0) + 1));
          for (const [tenantId, count] of byTenant) {
            await supabase.from('system_alerts').insert({
              tenant_id: tenantId,
              type: 'enrollment_key_expiring',
              severity: 'warning',
              message: `${count} enrollment key(s) expiring within 1 hour`,
              metadata: { count, check: 'security-monitor' },
            });
          }
        }
      })(),
    ]);

    [rotationResult, keysResult].forEach((r, i) => {
      if (r.status === 'rejected') logger.error(`[security-monitor] Check ${i} failed:`, r.reason);
    });

    result.duration_ms = Date.now() - startedAt;

    try {
      await supabase.rpc('update_cron_health', {
        p_cron_name: 'security-monitor',
        p_success: true,
        p_details: result,
      });
    } catch (_) { /* best effort */ }

    logger.info(`[security-monitor] Completed in ${result.duration_ms}ms`, JSON.stringify(result));

    return new Response(JSON.stringify({ success: true, ...result }), {
      headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  } catch (e) {
    const msg = (e as Error).message;
    logger.error('[security-monitor] Fatal:', msg);
    return new Response(JSON.stringify({ error: msg }), {
      status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' },
    });
  }
});
