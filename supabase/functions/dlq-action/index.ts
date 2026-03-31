/**
 * dlq-action — Migrated to serveTenant
 * Manages Dead Letter Queue items: resolve, delete, resolve_batch
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

type DlqAction = 'resolve' | 'delete' | 'resolve_batch';

interface DlqActionRequest {
  action: DlqAction;
  dlqItemId?: string;
  dlqItemIds?: string[];
  resolutionNotes?: string;
  resolutionSource?: 'human' | 'system' | 'auto_cleanup';
}

serveTenant<DlqActionRequest>(async (_req, ctx) => {
  const { supabase, userId, body } = ctx;
  const { action, dlqItemId, dlqItemIds, resolutionNotes, resolutionSource = 'human' } = body;

  if (!action) return new Response(JSON.stringify({ error: 'Missing action parameter' }), { status: 400 });

  logger.info(`[dlq-action] User ${userId} performing ${action}`);

  // Get user's tenants for authorization
  const { data: userRoles, error: rolesError } = await supabase
    .from('user_roles').select('tenant_id, role').eq('user_id', userId!);

  if (rolesError || !userRoles?.length) return new Response(JSON.stringify({ error: 'User has no tenant access' }), { status: 403 });

  const userTenantIds = userRoles.map(r => r.tenant_id);
  const isSuperAdmin = userRoles.some(r => r.role === 'super_admin');
  const isAdminOrOperator = userRoles.some(r => ['admin', 'operator', 'super_admin'].includes(r.role));

  if (!isAdminOrOperator) return new Response(JSON.stringify({ error: 'Insufficient permissions - admin/operator required' }), { status: 403 });

  switch (action) {
    case 'resolve': {
      if (!dlqItemId) return new Response(JSON.stringify({ error: 'Missing dlqItemId' }), { status: 400 });
      if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5))
        return new Response(JSON.stringify({ error: 'Resolution notes required (min 5 chars)' }), { status: 400 });

      const { data: item, error: itemError } = await supabase
        .from('failed_jobs_dlq').select('id, tenant_id').eq('id', dlqItemId).maybeSingle();
      if (itemError || !item) return new Response(JSON.stringify({ error: 'DLQ item not found' }), { status: 404 });
      if (!isSuperAdmin && !userTenantIds.includes(item.tenant_id))
        return new Response(JSON.stringify({ error: 'No access to this tenant' }), { status: 403 });

      const { error: updateError } = await supabase.from('failed_jobs_dlq').update({
        status: 'resolved', resolved_at: new Date().toISOString(),
        resolved_by: userId, resolution_notes: resolutionNotes, resolution_source: resolutionSource,
      }).eq('id', dlqItemId);

      if (updateError) return new Response(JSON.stringify({ error: 'Failed to resolve item' }), { status: 500 });
      logger.info(`[dlq-action] Resolved item ${dlqItemId}`);
      return { success: true, dlqItemId };
    }

    case 'resolve_batch': {
      if (!dlqItemIds?.length) return new Response(JSON.stringify({ error: 'Missing dlqItemIds' }), { status: 400 });
      if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5))
        return new Response(JSON.stringify({ error: 'Resolution notes required (min 5 chars)' }), { status: 400 });

      const { data: items, error: itemsError } = await supabase
        .from('failed_jobs_dlq').select('id, tenant_id').in('id', dlqItemIds);
      if (itemsError || !items?.length) return new Response(JSON.stringify({ error: 'DLQ items not found' }), { status: 404 });

      if (!isSuperAdmin) {
        const unauthorizedItems = items.filter(i => !userTenantIds.includes(i.tenant_id));
        if (unauthorizedItems.length > 0) return new Response(JSON.stringify({ error: 'No access to some items' }), { status: 403 });
      }

      const { error: updateError } = await supabase.from('failed_jobs_dlq').update({
        status: 'resolved', resolved_at: new Date().toISOString(),
        resolved_by: userId, resolution_notes: resolutionNotes, resolution_source: resolutionSource,
      }).in('id', dlqItemIds);

      if (updateError) return new Response(JSON.stringify({ error: 'Failed to resolve items' }), { status: 500 });
      logger.info(`[dlq-action] Resolved ${dlqItemIds.length} items`);
      return { success: true, count: dlqItemIds.length };
    }

    case 'delete': {
      if (!dlqItemId) return new Response(JSON.stringify({ error: 'Missing dlqItemId' }), { status: 400 });

      const { data: item, error: itemError } = await supabase
        .from('failed_jobs_dlq').select('id, tenant_id, status').eq('id', dlqItemId).maybeSingle();
      if (itemError || !item) return new Response(JSON.stringify({ error: 'DLQ item not found' }), { status: 404 });
      if (!isSuperAdmin && !userTenantIds.includes(item.tenant_id))
        return new Response(JSON.stringify({ error: 'No access to this tenant' }), { status: 403 });
      if (!['exhausted', 'resolved'].includes(item.status))
        return new Response(JSON.stringify({ error: 'Can only delete exhausted or resolved items' }), { status: 400 });

      const { error: deleteError } = await supabase.from('failed_jobs_dlq').delete().eq('id', dlqItemId);
      if (deleteError) return new Response(JSON.stringify({ error: 'Failed to delete item' }), { status: 500 });
      logger.info(`[dlq-action] Deleted item ${dlqItemId}`);
      return { success: true };
    }

    default:
      return new Response(JSON.stringify({ error: `Unknown action: ${action}` }), { status: 400 });
  }
});
