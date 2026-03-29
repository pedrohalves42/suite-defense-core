/**
 * CONSOLIDATED security-monitor (COST-OPT v10)
 * Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface SecurityResult {
  credential_rotation: { tokens_warning: number; tokens_expired: number };
  expiring_keys: { keys_found: number; notifications_sent: number };
  duration_ms: number;
}

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const startedAt = Date.now();

  const result: SecurityResult = {
    credential_rotation: { tokens_warning: 0, tokens_expired: 0 },
    expiring_keys: { keys_found: 0, notifications_sent: 0 },
    duration_ms: 0,
  };

  const [rotationResult, keysResult] = await Promise.allSettled([
    (async () => {
      const ninetyDaysAgo = new Date(Date.now() - 90 * 24 * 60 * 60 * 1000).toISOString();
      const sixtyDaysAgo = new Date(Date.now() - 60 * 24 * 60 * 60 * 1000).toISOString();

      const { data: expiredTokens } = await supabase
        .from('agent_tokens').select('id, agent_id, tenant_id')
        .lt('rotated_at', ninetyDaysAgo).eq('is_active', true).limit(200);
      result.credential_rotation.tokens_expired = expiredTokens?.length || 0;

      const { data: warningTokens } = await supabase
        .from('agent_tokens').select('id, agent_id, tenant_id')
        .lt('rotated_at', sixtyDaysAgo).gte('rotated_at', ninetyDaysAgo)
        .eq('is_active', true).limit(200);
      result.credential_rotation.tokens_warning = warningTokens?.length || 0;

      if (expiredTokens?.length) {
        const tenantIds = [...new Set(expiredTokens.map(t => t.tenant_id))];
        for (const tenantId of tenantIds) {
          const count = expiredTokens.filter(t => t.tenant_id === tenantId).length;
          await supabase.from('system_alerts').upsert({
            tenant_id: tenantId, type: 'credential_rotation_overdue', severity: 'high',
            message: `${count} agent token(s) overdue for rotation (>90 days)`,
            metadata: { count, check: 'security-monitor' },
          }, { onConflict: 'tenant_id,type' });
        }
      }
    })(),
    (async () => {
      const oneHourFromNow = new Date(Date.now() + 60 * 60 * 1000).toISOString();
      const now = new Date().toISOString();

      const { data: expiringKeys, error } = await supabase
        .from('enrollment_keys').select('id, key, expires_at, description, tenant_id')
        .lt('expires_at', oneHourFromNow).gt('expires_at', now)
        .is('expiration_notified_at', null).eq('is_active', true);

      if (error) { logger.error(`[${requestId}] security-monitor: expiring-keys error:`, error.message); return; }
      result.expiring_keys.keys_found = expiringKeys?.length || 0;

      if (expiringKeys?.length) {
        const keyIds = expiringKeys.map(k => k.id);
        await supabase.from('enrollment_keys').update({ expiration_notified_at: now }).in('id', keyIds);
        result.expiring_keys.notifications_sent = keyIds.length;

        const byTenant = new Map<string, number>();
        expiringKeys.forEach(k => byTenant.set(k.tenant_id, (byTenant.get(k.tenant_id) || 0) + 1));
        for (const [tenantId, count] of byTenant) {
          await supabase.from('system_alerts').insert({
            tenant_id: tenantId, type: 'enrollment_key_expiring', severity: 'warning',
            message: `${count} enrollment key(s) expiring within 1 hour`,
            metadata: { count, check: 'security-monitor' },
          });
        }
      }
    })(),
  ]);

  [rotationResult, keysResult].forEach((r, i) => {
    if (r.status === 'rejected') logger.error(`[${requestId}] security-monitor: Check ${i} failed:`, r.reason);
  });

  result.duration_ms = Date.now() - startedAt;

  try {
    await supabase.rpc('update_cron_health', { p_cron_name: 'security-monitor', p_success: true, p_details: result });
  } catch { /* best effort */ }

  logger.info(`[${requestId}] security-monitor: Completed in ${result.duration_ms}ms`);
  return { success: true, ...result };
});
