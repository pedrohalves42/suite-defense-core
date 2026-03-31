/**
 * auto-renew-enrollment-keys → Migrated to serveInternal middleware
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { loggerWithContext } from '../_shared/logger.ts';

serveInternal(async (_req, ctx) => {
  const { supabase, requestId } = ctx;
  const log = loggerWithContext(requestId);
  log.info('Starting auto-renew enrollment keys check');

  const { data: allTenants, error: tenantsError } = await supabase.from('tenants').select('id, name');
  if (tenantsError) throw new Error('Failed to fetch tenants');

  const { data: tenantsWithActiveKeys, error: activeKeysError } = await supabase
    .from('enrollment_keys').select('tenant_id').eq('is_active', true).gt('expires_at', new Date().toISOString());
  if (activeKeysError) throw new Error('Failed to fetch active keys');

  const tenantsWithKeysSet = new Set(tenantsWithActiveKeys?.map(k => k.tenant_id) || []);
  const orphanTenants = (allTenants || []).filter(t => !tenantsWithKeysSet.has(t.id));

  if (orphanTenants.length === 0) {
    return { success: true, message: 'All tenants have active enrollment keys', tenantsChecked: 0, keysGenerated: 0, timestamp: new Date().toISOString() };
  }

  const results: { tenantId: string; tenantName: string; success: boolean; error?: string }[] = [];

  for (const tenant of orphanTenants) {
    try {
      const enrollmentKey = generateSecureKey();
      const keyHash = await hashKey(enrollmentKey);
      const expiresAt = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString();

      const { data: keyData, error: insertError } = await supabase.from('enrollment_keys').insert({
        key_hash: keyHash, tenant_id: tenant.id, expires_at: expiresAt, max_uses: 100, current_uses: 0,
        is_active: true, description: `[AUTO] Chave gerada automaticamente`, created_by: null,
      }).select('id').single();

      if (insertError) { results.push({ tenantId: tenant.id, tenantName: tenant.name, success: false, error: insertError.message }); continue; }

      await supabase.from('audit_logs').insert({ user_id: null, action: 'auto_renew_enrollment_key', resource_type: 'enrollment_key', resource_id: keyData.id, tenant_id: tenant.id, details: { reason: 'all_keys_expired', expires_at: expiresAt, max_uses: 100, auto_generated: true }, success: true });
      await supabase.from('security_logs').insert({ tenant_id: tenant.id, event_type: 'enrollment_key_auto_renewed', severity: 'info', description: `Nova chave de enrollment gerada automaticamente para tenant ${tenant.name}`, details: { tenant_name: tenant.name, new_key_expires_at: expiresAt, key_id: keyData.id }, source_ip: '0.0.0.0' });

      results.push({ tenantId: tenant.id, tenantName: tenant.name, success: true });
    } catch (err) {
      results.push({ tenantId: tenant.id, tenantName: tenant.name, success: false, error: err instanceof Error ? err.message : 'Unknown error' });
    }
  }

  const successCount = results.filter(r => r.success).length;
  return { success: true, message: `Auto-renewal completed: ${successCount} keys generated`, tenantsChecked: orphanTenants.length, keysGenerated: successCount, failures: results.filter(r => !r.success).length, details: results, timestamp: new Date().toISOString() };
});

function generateSecureKey(): string {
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const segments: string[] = [];
  for (let i = 0; i < 4; i++) {
    const randomBytes = new Uint8Array(4);
    crypto.getRandomValues(randomBytes);
    let segment = '';
    for (let j = 0; j < 4; j++) segment += chars[randomBytes[j] % chars.length];
    segments.push(segment);
  }
  return segments.join('-');
}

async function hashKey(key: string): Promise<string> {
  const buf = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(key));
  return Array.from(new Uint8Array(buf)).map(b => b.toString(16).padStart(2, '0')).join('');
}
