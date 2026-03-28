/**
 * cleanup-router - Consolidated cleanup edge function
 * 
 * Routes cleanup actions to specific handlers based on the `action` parameter.
 * 
 * Auth modes:
 * - Internal actions (cron): assertInternalCaller or service_role JWT
 * - Admin actions: Bearer JWT + admin role check
 * 
 * Usage:
 *   POST /functions/v1/cleanup-router
 *   Body: { "action": "telemetry" }
 *   Body: { "action": "stuck-jobs" }
 *   Body: { "action": "jobs", ...filters }
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
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

// Internal actions (cron/service_role) - no user JWT needed
const INTERNAL_ACTIONS = new Set([
  'telemetry',
  'stale-reports',
  'stale-updates',
  'stale-playbooks',
  'offline-agents-jobs',
  'stuck-builds',
  'stuck-jobs',
  'auto-cleanup-jobs',
  'security',
]);

// Admin actions (requires JWT + admin role)
const ADMIN_ACTIONS = new Set([
  'jobs',
]);

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await req.json().catch(() => ({}));
    const action = body.action as string;

    if (!action) {
      return new Response(
        JSON.stringify({ error: 'Missing required field: action', requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`[${requestId}] [cleanup-router] Action: ${action}`);

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

    let result: unknown;

    if (INTERNAL_ACTIONS.has(action)) {
      // Internal auth check
      const authError = assertInternalCaller(req);
      if (authError) return authError;

      const supabase = createClient(supabaseUrl, supabaseServiceKey);

      switch (action) {
        case 'telemetry':
          result = await handleCleanupTelemetry(supabase, requestId);
          break;
        case 'stale-reports':
          result = await handleCleanupStaleReports(supabase, requestId);
          break;
        case 'stale-updates':
          result = await handleCleanupStaleUpdates(supabase, requestId);
          break;
        case 'stale-playbooks':
          result = await handleCleanupStalePlaybooks(supabase, requestId);
          break;
        case 'offline-agents-jobs':
          result = await handleCleanupOfflineAgentsJobs(supabase, requestId);
          break;
        case 'stuck-builds':
          result = await handleCleanupStuckBuilds(supabase, requestId);
          break;
        case 'stuck-jobs':
          result = await handleCleanupStuckJobs(supabase, requestId);
          break;
        case 'auto-cleanup-jobs':
          result = await handleAutoCleanupJobs(supabase, requestId, body);
          break;
        case 'security':
          result = await handleSecurityCleanup(supabase, requestId);
          break;
        default:
          return new Response(
            JSON.stringify({ error: `Unknown action: ${action}`, requestId }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
      }
    } else if (ADMIN_ACTIONS.has(action)) {
      // JWT auth check for admin actions
      const authHeader = req.headers.get('Authorization');
      if (!authHeader) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized: Missing token', requestId }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      const supabase = createClient(supabaseUrl, supabaseServiceKey);
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: authErr } = await supabase.auth.getUser(token);

      if (authErr || !user) {
        return new Response(
          JSON.stringify({ error: 'Unauthorized', requestId }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      // Check admin role
      const { data: userRole } = await supabase
        .from('user_roles')
        .select('role, tenant_id')
        .eq('user_id', user.id)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
        return new Response(
          JSON.stringify({ error: 'Forbidden: Admin access required', requestId }),
          { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }

      switch (action) {
        case 'jobs':
          result = await handleCleanupJobs(supabase, requestId, body, userRole.tenant_id);
          break;
        default:
          return new Response(
            JSON.stringify({ error: `Unknown admin action: ${action}`, requestId }),
            { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          );
      }
    } else {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}`, requestId }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const durationMs = Date.now() - startedAt;
    logger.info(`[${requestId}] [cleanup-router] ${action} completed in ${durationMs}ms`);

    // Log observability
    try {
      const supabase = createClient(supabaseUrl, supabaseServiceKey);
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
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error(`[${requestId}] [cleanup-router] Error:`, errorMessage);

    return new Response(
      JSON.stringify({ success: false, error: errorMessage, requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
