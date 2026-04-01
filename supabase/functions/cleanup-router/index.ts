/**
 * cleanup-router - Consolidated cleanup edge function
 * 
 * MIGRATED to servePublic middleware (dual auth managed in handler)
 * - Internal actions (cron): assertInternalCaller or service_role JWT
 * - Admin actions: Bearer JWT + admin role check
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import {
  handleCleanupTelemetry,
  handleCleanupStaleReports,
  handleCleanupStaleUpdates,
  handleCleanupStalePlaybooks,
  handleCleanupOfflineAgentsJobs,
  handleCleanupStuckBuilds,
  handleCleanupStuckJobs,
  handleAutoCleanupJobs,
  handleSecurityCleanup,
  handleCleanupJobs,
} from './handlers.ts';

// Internal actions (cron/service_role) — no user JWT needed
const INTERNAL_ACTIONS = new Set([
  'telemetry', 'stale-reports', 'stale-updates', 'stale-playbooks',
  'offline-agents-jobs', 'stuck-builds', 'stuck-jobs', 'auto-cleanup-jobs', 'security',
]);

// Admin actions (requires JWT + admin role)
const ADMIN_ACTIONS = new Set(['jobs']);

servePublic(async (req, ctx) => {
  const { supabase, requestId, body: rawBody } = ctx;
  const origin = req.headers.get('origin');
  const startedAt = Date.now();
  const body = rawBody as Record<string, unknown>;
  const action = body.action as string;

  if (!action) {
    return new Response(
      JSON.stringify({ error: 'Missing required field: action', requestId }),
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }

  logger.info(`[${requestId}] [cleanup-router] Action: ${action}`);

  let result: unknown;

  if (INTERNAL_ACTIONS.has(action)) {
    // Internal auth check
    const authError = await assertInternalCaller(req);
    if (authError) return authError;

    switch (action) {
      case 'telemetry': result = await handleCleanupTelemetry(supabase, requestId); break;
      case 'stale-reports': result = await handleCleanupStaleReports(supabase, requestId); break;
      case 'stale-updates': result = await handleCleanupStaleUpdates(supabase, requestId); break;
      case 'stale-playbooks': result = await handleCleanupStalePlaybooks(supabase, requestId); break;
      case 'offline-agents-jobs': result = await handleCleanupOfflineAgentsJobs(supabase, requestId); break;
      case 'stuck-builds': result = await handleCleanupStuckBuilds(supabase, requestId); break;
      case 'stuck-jobs': result = await handleCleanupStuckJobs(supabase, requestId); break;
      case 'auto-cleanup-jobs': result = await handleAutoCleanupJobs(supabase, requestId, body); break;
      case 'security': result = await handleSecurityCleanup(supabase, requestId); break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown action: ${action}`, requestId }),
          { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
        );
    }
  } else if (ADMIN_ACTIONS.has(action)) {
    // JWT auth check for admin actions
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized: Missing token', requestId }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

    if (authErr || !user) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized', requestId }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      );
    }

    // Check admin role
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role, tenant_id')
      .eq('user_id', user.id)
      .order('created_at', { ascending: false })
      .limit(1).maybeSingle();

    if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Forbidden: Admin access required', requestId }),
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      );
    }

    switch (action) {
      case 'jobs': result = await handleCleanupJobs(supabase, requestId, body, userRole.tenant_id); break;
      default:
        return new Response(
          JSON.stringify({ error: `Unknown admin action: ${action}`, requestId }),
          { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
        );
    }
  } else {
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}`, requestId }),
      { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  }

  const durationMs = Date.now() - startedAt;
  logger.info(`[${requestId}] [cleanup-router] ${action} completed in ${durationMs}ms`);

  // Log observability (fire-and-forget)
  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: `cleanup-router:${action}`,
      p_success: true,
      p_duration_ms: durationMs,
      p_result: result,
      p_processed_count: (result as Record<string, unknown>)?.total_cleaned ?? (result as Record<string, unknown>)?.cleaned ?? (result as Record<string, unknown>)?.deleted_count ?? 0,
      p_job_source: INTERNAL_ACTIONS.has(action) ? 'cron' : 'admin',
    });
  } catch (_) { /* non-critical */ }

  return new Response(
    JSON.stringify({ ...result as Record<string, unknown>, requestId, action, duration_ms: durationMs }),
    { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
  );
});
