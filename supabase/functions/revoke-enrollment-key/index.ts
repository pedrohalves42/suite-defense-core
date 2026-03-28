/**
 * Revoke Enrollment Key - Migrated to serveTenant middleware
 * Allows admins to revoke enrollment keys within their tenant.
 * Super admins can revoke keys from any tenant.
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RevokeKeySchema = z.object({
  keyId: z.string().uuid('keyId must be a valid UUID'),
});

serveTenant(async (_req, ctx) => {
  const { supabase, userId, tenantId, requestId, body } = ctx;

  const parsed = RevokeKeySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid input', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { keyId } = parsed.data;

  // Get user's role
  const { data: userRoles, error: roleError } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', userId);

  const userRole = userRoles?.find(r => r.role === 'super_admin') || userRoles?.[0] || null;

  if (roleError || !userRole) {
    logger.error('Failed to get user role', { userId, error: roleError });
    return new Response(
      JSON.stringify({ error: 'User role not found' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!['admin', 'super_admin'].includes(userRole.role)) {
    logger.warn('Unauthorized revoke attempt', { userId, role: userRole.role });
    return new Response(
      JSON.stringify({ error: 'Admin access required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get the enrollment key to verify tenant ownership
  const { data: key, error: keyError } = await supabase
    .from('enrollment_keys')
    .select('id, tenant_id, is_active, description')
    .eq('id', keyId)
    .single();

  if (keyError || !key) {
    logger.warn('Key not found', { keyId, error: keyError });
    return new Response(
      JSON.stringify({ error: 'Key not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify tenant ownership (super_admin can revoke any tenant's key)
  if (userRole.role !== 'super_admin' && key.tenant_id !== tenantId) {
    logger.warn('Cross-tenant revoke attempt', {
      userId,
      userTenant: tenantId,
      keyTenant: key.tenant_id,
    });
    return new Response(
      JSON.stringify({ error: 'Access denied to this key' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!key.is_active) {
    return new Response(
      JSON.stringify({ error: 'Key is already revoked' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Revoke the key
  const { error: revokeError } = await supabase
    .from('enrollment_keys')
    .update({ is_active: false })
    .eq('id', keyId);

  if (revokeError) {
    logger.error('Failed to revoke key', { keyId, error: revokeError });
    return new Response(
      JSON.stringify({ error: 'Failed to revoke key' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create audit log
  await supabase.from('audit_logs').insert({
    user_id: userId,
    tenant_id: tenantId,
    action: 'revoke_enrollment_key',
    resource_type: 'enrollment_key',
    resource_id: keyId,
    details: {
      key_description: key.description,
      revoked_at: new Date().toISOString(),
    },
    success: true,
  });

  logger.info('Key revoked successfully', { keyId, userId, requestId });

  return { success: true, keyId };
}, { methods: ['POST'] });
