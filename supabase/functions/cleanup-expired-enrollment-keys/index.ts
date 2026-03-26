/**
 * Cleanup Expired Enrollment Keys
 * Deletes inactive keys expired > 48h
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { loggerWithContext } from '../_shared/logger.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, userId, requestId } = ctx;
  const log = loggerWithContext(requestId);

  // Verify admin role
  const { data: hasRole, error: roleError } = await supabase.rpc('has_role', {
    _user_id: userId,
    _role: 'admin',
  });

  if (roleError || !hasRole) {
    log.warn('User lacks admin role');
    return new Response(
      JSON.stringify({ error: 'Forbidden: Admin role required' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const fortyEightHoursAgo = new Date(Date.now() - 48 * 60 * 60 * 1000);
  log.info('Starting cleanup of expired enrollment keys', { threshold: fortyEightHoursAgo.toISOString() });

  const { data, error } = await supabase
    .from('enrollment_keys')
    .delete()
    .lt('expires_at', fortyEightHoursAgo.toISOString())
    .eq('is_active', false)
    .select('id');

  if (error) {
    log.error('Error deleting expired keys', error);
    throw error;
  }

  const deletedCount = data?.length || 0;
  log.success('Cleanup completed', { deletedCount });

  return {
    success: true,
    deleted_count: deletedCount,
    message: `Limpeza concluida: ${deletedCount} chaves expiradas removidas`,
    timestamp: new Date().toISOString(),
  };
}, {
  skipTenantValidation: true,
  methods: ['POST'],
});
