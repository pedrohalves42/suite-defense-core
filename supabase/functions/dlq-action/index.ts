import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

type DlqAction = 'resolve' | 'delete' | 'resolve_batch';

interface DlqActionRequest {
  action: DlqAction;
  dlqItemId?: string;
  dlqItemIds?: string[];
  resolutionNotes?: string;
  resolutionSource?: 'human' | 'system' | 'auto_cleanup';
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    // Get authorization header
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Missing authorization header' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Create Supabase clients
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

    // Get current user
    const { data: { user }, error: userError } = await userClient.auth.getUser();
    if (userError || !user) {
      logger.error('[dlq-action] Auth error:', userError);
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Parse request body
    const body = await req.json() as DlqActionRequest;
    const { action, dlqItemId, dlqItemIds, resolutionNotes, resolutionSource = 'human' } = body;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing action parameter' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[dlq-action] User ${user.id} performing ${action}`);

    // Get user's tenants for authorization
    const { data: userRoles, error: rolesError } = await serviceClient
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id);

    if (rolesError || !userRoles?.length) {
      return new Response(
        JSON.stringify({ error: 'User has no tenant access' }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const userTenantIds = userRoles.map(r => r.tenant_id);
    const isSuperAdmin = userRoles.some(r => r.role === 'super_admin');
    const isAdminOrOperator = userRoles.some(r => ['admin', 'operator', 'super_admin'].includes(r.role));

    if (!isAdminOrOperator) {
      return new Response(
        JSON.stringify({ error: 'Insufficient permissions - admin/operator required' }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Handle different actions
    switch (action) {
      case 'resolve': {
        if (!dlqItemId) {
          return new Response(
            JSON.stringify({ error: 'Missing dlqItemId' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5)) {
          return new Response(
            JSON.stringify({ error: 'Resolution notes required (min 5 chars)' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Verify item exists and user has access
        const { data: item, error: itemError } = await serviceClient
          .from('failed_jobs_dlq')
          .select('id, tenant_id')
          .eq('id', dlqItemId)
          .maybeSingle();

        if (itemError || !item) {
          return new Response(
            JSON.stringify({ error: 'DLQ item not found' }),
            { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        if (!isSuperAdmin && !userTenantIds.includes(item.tenant_id)) {
          return new Response(
            JSON.stringify({ error: 'No access to this tenant' }),
            { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Resolve the item
        const { error: updateError } = await serviceClient
          .from('failed_jobs_dlq')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
            resolution_notes: resolutionNotes,
            resolution_source: resolutionSource,
          })
          .eq('id', dlqItemId);

        if (updateError) {
          logger.error('[dlq-action] Resolve failed:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to resolve item' }),
            { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        logger.info(`[dlq-action] Resolved item ${dlqItemId}`);
        return new Response(
          JSON.stringify({ success: true, dlqItemId }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'resolve_batch': {
        if (!dlqItemIds?.length) {
          return new Response(
            JSON.stringify({ error: 'Missing dlqItemIds' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        if (resolutionSource === 'human' && (!resolutionNotes || resolutionNotes.trim().length < 5)) {
          return new Response(
            JSON.stringify({ error: 'Resolution notes required (min 5 chars)' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Verify all items exist and user has access
        const { data: items, error: itemsError } = await serviceClient
          .from('failed_jobs_dlq')
          .select('id, tenant_id')
          .in('id', dlqItemIds);

        if (itemsError || !items?.length) {
          return new Response(
            JSON.stringify({ error: 'DLQ items not found' }),
            { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Check tenant access for all items
        if (!isSuperAdmin) {
          const unauthorizedItems = items.filter(i => !userTenantIds.includes(i.tenant_id));
          if (unauthorizedItems.length > 0) {
            return new Response(
              JSON.stringify({ error: 'No access to some items' }),
              { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          }
        }

        // Resolve all items
        const { error: updateError } = await serviceClient
          .from('failed_jobs_dlq')
          .update({
            status: 'resolved',
            resolved_at: new Date().toISOString(),
            resolved_by: user.id,
            resolution_notes: resolutionNotes,
            resolution_source: resolutionSource,
          })
          .in('id', dlqItemIds);

        if (updateError) {
          logger.error('[dlq-action] Batch resolve failed:', updateError);
          return new Response(
            JSON.stringify({ error: 'Failed to resolve items' }),
            { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        logger.info(`[dlq-action] Resolved ${dlqItemIds.length} items`);
        return new Response(
          JSON.stringify({ success: true, count: dlqItemIds.length }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      case 'delete': {
        if (!dlqItemId) {
          return new Response(
            JSON.stringify({ error: 'Missing dlqItemId' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Verify item exists and user has access
        const { data: item, error: itemError } = await serviceClient
          .from('failed_jobs_dlq')
          .select('id, tenant_id, status')
          .eq('id', dlqItemId)
          .maybeSingle();

        if (itemError || !item) {
          return new Response(
            JSON.stringify({ error: 'DLQ item not found' }),
            { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        if (!isSuperAdmin && !userTenantIds.includes(item.tenant_id)) {
          return new Response(
            JSON.stringify({ error: 'No access to this tenant' }),
            { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Only allow delete of exhausted/resolved items
        if (!['exhausted', 'resolved'].includes(item.status)) {
          return new Response(
            JSON.stringify({ error: 'Can only delete exhausted or resolved items' }),
            { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // Delete the item
        const { error: deleteError } = await serviceClient
          .from('failed_jobs_dlq')
          .delete()
          .eq('id', dlqItemId);

        if (deleteError) {
          logger.error('[dlq-action] Delete failed:', deleteError);
          return new Response(
            JSON.stringify({ error: 'Failed to delete item' }),
            { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        logger.info(`[dlq-action] Deleted item ${dlqItemId}`);
        return new Response(
          JSON.stringify({ success: true }),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }

      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}` }),
          { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

  } catch (error) {
    logger.error('[dlq-action] Unexpected error:', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
