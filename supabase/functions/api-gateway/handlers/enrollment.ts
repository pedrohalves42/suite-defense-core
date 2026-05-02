// @ts-nocheck
/**
 * Enrollment handlers — Phase 2F
 * Inlined: generate-enrollment-key, revoke-enrollment-key
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import type { HandlerContext } from './admin.ts';

type Supabase = any;

// ── generate-enrollment-key ────────────────────────────────────────────
export async function handleGenerateEnrollmentKey(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  const tenantId = ctx?.tenantId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const expiresInHours = payload.expiresInHours as number;
  const maxUses = (payload.maxUses as number) || 1;
  const description = (payload.description as string) || '';

  if (!expiresInHours || expiresInHours <= 0 || !Number.isInteger(expiresInHours)) {
    return { __status: 400, error: 'expiresInHours must be a positive integer' };
  }

  // Role check
  const { data: userRole } = await supabase.from('user_roles').select('role, tenant_id')
    .eq('user_id', userId).limit(1).maybeSingle();
  if (!userRole || !['admin', 'operator', 'super_admin'].includes(userRole.role)) {
    return { __status: 403, error: 'Forbidden: only admins, operators, and super admins can generate keys' };
  }

  const effectiveTenantId = tenantId || userRole.tenant_id;

  // Generate key XXXX-XXXX-XXXX-XXXX using bias-free crypto random values
  const segments: string[] = [];
  const chars = 'ABCDEFGHIJKLMNOPQRSTUVWXYZ0123456789';
  const charArray = chars.split('');
  
  for (let i = 0; i < 4; i++) {
    let segment = '';
    const randomValues = new Uint32Array(4);
    crypto.getRandomValues(randomValues);
    for (let j = 0; j < 4; j++) {
      segment += charArray[randomValues[j] % chars.length];
    }
    segments.push(segment);
  }
  const enrollmentKey = segments.join('-');
  const expiresAt = new Date(Date.now() + expiresInHours * 60 * 60 * 1000).toISOString();

  // SHA-256 hash
  const keyHashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(enrollmentKey));
  const keyHash = Array.from(new Uint8Array(keyHashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  const { data: keyData, error: insertError } = await supabase.from('enrollment_keys').insert({
    key_hash: keyHash, created_by: userId, expires_at: expiresAt,
    max_uses: maxUses, description: description || 'Chave gerada por usuario', tenant_id: effectiveTenantId,
  }).select().order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (insertError) throw new Error('Failed to create enrollment key');

  await supabase.from('audit_logs').insert({
    user_id: userId, action: 'create_enrollment_key', resource_type: 'enrollment_key',
    resource_id: keyData.id, tenant_id: effectiveTenantId,
    details: { expiresInHours, maxUses, description: keyData.description }, success: true,
  });

  return { enrollmentKey, expiresAt: keyData.expires_at, maxUses: keyData.max_uses, description: keyData.description };
}

// ── revoke-enrollment-key ──────────────────────────────────────────────
export async function handleRevokeEnrollmentKey(
  supabase: Supabase, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  const tenantId = ctx?.tenantId;
  if (!userId) return { __status: 401, error: 'Authentication required' };

  const keyId = payload.keyId as string;
  if (!keyId) return { __status: 400, error: 'keyId is required' };

  // Get user's role
  const { data: userRoles } = await supabase.from('user_roles').select('role, tenant_id').eq('user_id', userId);
  const userRole = userRoles?.find(r => r.role === 'super_admin') || userRoles?.[0] || null;
  if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
    return { __status: 403, error: 'Admin access required' };
  }

  const { data: key, error: keyError } = await supabase.from('enrollment_keys')
    .select('id, tenant_id, is_active, description').eq('id', keyId).single();
  if (keyError || !key) return { __status: 404, error: 'Key not found' };

  if (userRole.role !== 'super_admin' && key.tenant_id !== tenantId) {
    return { __status: 403, error: 'Access denied to this key' };
  }
  if (!key.is_active) return { __status: 400, error: 'Key is already revoked' };

  const { error: revokeError } = await supabase.from('enrollment_keys').update({ is_active: false }).eq('id', keyId);
  if (revokeError) return { __status: 500, error: 'Failed to revoke key' };

  await supabase.from('audit_logs').insert({
    user_id: userId, tenant_id: tenantId, action: 'revoke_enrollment_key',
    resource_type: 'enrollment_key', resource_id: keyId,
    details: { key_description: key.description, revoked_at: new Date().toISOString() }, success: true,
  });

  return { success: true, keyId };
}