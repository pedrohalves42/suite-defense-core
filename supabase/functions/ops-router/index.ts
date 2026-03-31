/**
 * ops-router — Unified Operations Router
 * 
 * Consolidates cleanup-router, notification-router, and evaluate-automation-rules
 * into a single entry point to reduce cold starts and unify auth governance.
 * 
 * Namespaced actions:
 *   cleanup:telemetry, cleanup:stuck-jobs, cleanup:jobs, ...
 *   notify:email, notify:telegram, notify:dispatch, ...
 *   automation:evaluate
 * 
 * Auth:
 *   - Internal (cron/service_role): assertInternalCaller
 *   - Admin (JWT): Bearer token + admin/super_admin role
 *   - Mixed: automation:evaluate supports both
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

// Cleanup handlers
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
} from '../cleanup-router/handlers.ts';

// Notification handlers
import { handleEmail } from '../notification-router/handler-email.ts';
import { handleTelegram } from '../notification-router/handler-telegram.ts';
import { handleWhatsApp } from '../notification-router/handler-whatsapp.ts';
import { handleWebhook } from '../notification-router/handler-webhook.ts';
import { handleWelcome } from '../notification-router/handler-welcome.ts';
import { handleSecurity as handleNotifySecurity } from '../notification-router/handler-security.ts';

// Automation handler
import { evaluateForTenant } from '../evaluate-automation-rules/tenant-evaluator.ts';

const RouterSchema = z.object({
  action: z.string().min(1).max(80),
  payload: z.record(z.unknown()).optional().default({}),
});

// ── Cleanup: internal (cron) actions ─────────────────────
const CLEANUP_INTERNAL = new Set([
  'telemetry', 'stale-reports', 'stale-updates', 'stale-playbooks',
  'offline-agents-jobs', 'stuck-builds', 'stuck-jobs', 'auto-cleanup-jobs', 'security',
]);
const CLEANUP_ADMIN = new Set(['jobs']);

// ── Notification: direct handlers ────────────────────────
const NOTIFY_DIRECT: Record<string, (p: Record<string, unknown>, s: any, rid: string) => Promise<Record<string, unknown>>> = {
  'email': handleEmail,
  'telegram': handleTelegram,
  'whatsapp': handleWhatsApp,
  'webhook': handleWebhook,
  'welcome': handleWelcome,
  'security': handleNotifySecurity,
};

// ── Notification: proxy targets ──────────────────────────
const NOTIFY_PROXY: Record<string, string> = {
  'dispatch': 'notification-dispatcher',
  'report': 'send-report-notification',
  'invite': 'send-invite',
  'trial-reminder': 'send-trial-reminder',
  'scheduled-report': 'send-scheduled-report',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SERVICE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

function mkClient() {
  return createClient(SUPABASE_URL, SERVICE_KEY);
}

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

// ─── Auth helpers ────────────────────────────────────────
async function requireAdmin(req: Request, origin: string | null, requestId: string) {
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) return { error: jsonRes({ error: 'Unauthorized: Missing token', requestId }, 401, origin) };

  const supabase = mkClient();
  const token = authHeader.replace('Bearer ', '');
  const { data: { user }, error: authErr } = await supabase.auth.getUser(token);
  if (authErr || !user) return { error: jsonRes({ error: 'Unauthorized', requestId }, 401, origin) };

  const { data: userRole } = await supabase
    .from('user_roles')
    .select('role, tenant_id')
    .eq('user_id', user.id)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
    return { error: jsonRes({ error: 'Forbidden: Admin access required', requestId }, 403, origin) };
  }

  return { supabase, userRole, user };
}

// ─── Cleanup dispatcher ─────────────────────────────────
async function dispatchCleanup(action: string, payload: Record<string, unknown>, req: Request, origin: string | null, requestId: string) {
  if (CLEANUP_INTERNAL.has(action)) {
    const authError = assertInternalCaller(req);
    if (authError) return authError;

    const supabase = mkClient();
    switch (action) {
      case 'telemetry': return await handleCleanupTelemetry(supabase, requestId);
      case 'stale-reports': return await handleCleanupStaleReports(supabase, requestId);
      case 'stale-updates': return await handleCleanupStaleUpdates(supabase, requestId);
      case 'stale-playbooks': return await handleCleanupStalePlaybooks(supabase, requestId);
      case 'offline-agents-jobs': return await handleCleanupOfflineAgentsJobs(supabase, requestId);
      case 'stuck-builds': return await handleCleanupStuckBuilds(supabase, requestId);
      case 'stuck-jobs': return await handleCleanupStuckJobs(supabase, requestId);
      case 'auto-cleanup-jobs': return await handleAutoCleanupJobs(supabase, requestId, payload);
      case 'security': return await handleSecurityCleanup(supabase, requestId);
    }
  }

  if (CLEANUP_ADMIN.has(action)) {
    const auth = await requireAdmin(req, origin, requestId);
    if ('error' in auth) return auth.error;
    return await handleCleanupJobs(auth.supabase!, requestId, payload, auth.userRole!.tenant_id);
  }

  return null;
}

// ─── Notification dispatcher ─────────────────────────────
async function dispatchNotify(action: string, payload: Record<string, unknown>, req: Request, origin: string | null, requestId: string) {
  const directHandler = NOTIFY_DIRECT[action];
  if (directHandler) {
    const supabase = mkClient();
    return await directHandler(payload, supabase, requestId);
  }

  const functionName = NOTIFY_PROXY[action];
  if (functionName) {
    const targetUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const headers: Record<string, string> = { 'Content-Type': 'application/json', 'X-Request-ID': requestId };
    for (const h of ['Authorization', 'apikey', 'X-Internal-Secret']) {
      const v = req.headers.get(h);
      if (v) headers[h] = v;
    }
    const resp = await fetchWithTimeout(targetUrl, { method: 'POST', headers, body: JSON.stringify(payload) });
    const body = await resp.text();
    return new Response(body, {
      status: resp.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': resp.headers.get('Content-Type') || 'application/json' },
    });
  }

  return null;
}

// ─── Automation dispatcher ───────────────────────────────
async function dispatchAutomation(action: string, payload: Record<string, unknown>, req: Request, origin: string | null, requestId: string) {
  if (action !== 'evaluate') return null;

  const supabase = mkClient();
  const authHeader = req.headers.get('authorization');
  let tenantId: string | null = payload.tenant_id as string | null ?? null;
  let isServiceRole = false;

  if (authHeader) {
    const token = authHeader.replace('Bearer ', '');
    if (token === SERVICE_KEY) {
      isServiceRole = true;
    } else {
      try {
        const p = JSON.parse(atob(token.split('.')[1]));
        if (p.role === 'service_role') isServiceRole = true;
      } catch (_) { /* */ }

      if (!isServiceRole) {
        const { data: { user }, error } = await supabase.auth.getUser(token);
        if (error || !user) return jsonRes({ error: 'Unauthorized' }, 401, origin);

        const { data: roleData } = await supabase
          .from('user_roles')
          .select('tenant_id, role')
          .eq('user_id', user.id)
          .in('role', ['admin', 'super_admin'])
          .limit(1)
          .maybeSingle();

        if (!roleData) return jsonRes({ error: 'Admin access required' }, 403, origin);
        tenantId = roleData.tenant_id;
      }
    }
  }

  // Cron mode: iterate all tenants
  if (!tenantId && isServiceRole) {
    const { data: tenants } = await supabase.from('tenants').select('id').limit(50);
    if (!tenants?.length) return { message: 'No tenants found' };

    let totalEvaluated = 0, totalTriggered = 0, totalBlocked = 0, totalDecisions = 0;
    const riskScores: Record<string, number> = {};

    for (const t of tenants) {
      const r = await evaluateForTenant(supabase, t.id);
      totalEvaluated += r.evaluated;
      totalTriggered += r.triggered;
      totalBlocked += r.blocked;
      totalDecisions += r.decisions;
      if (r.risk_score != null) riskScores[t.id] = r.risk_score;
    }

    return { tenants_processed: tenants.length, evaluated: totalEvaluated, triggered: totalTriggered, blocked: totalBlocked, decisions: totalDecisions, risk_scores: riskScores };
  }

  if (!tenantId) return jsonRes({ error: 'tenant_id required' }, 400, origin);

  return await evaluateForTenant(supabase, tenantId);
}

// ═══════════════ MAIN ════════════════════════════════════
Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });
  if (req.method !== 'POST') return jsonRes({ error: 'Method not allowed' }, 405, origin);

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  // Auth: internal or JWT
  const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) {
      return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);
    }

    const { action: rawAction, payload } = parsed.data;
    const [namespace, ...rest] = rawAction.split(':');
    const action = rest.join(':') || namespace;
    const ns = rest.length > 0 ? namespace : null;

    logger.info(`[${requestId}] ops-router: ns=${ns ?? 'auto'} action=${action}`);

    let result: unknown;

    if (ns === 'cleanup' || (!ns && (CLEANUP_INTERNAL.has(action) || CLEANUP_ADMIN.has(action)))) {
      result = await dispatchCleanup(action, payload, req, origin, requestId);
    } else if (ns === 'notify' || (!ns && (action in NOTIFY_DIRECT || action in NOTIFY_PROXY))) {
      result = await dispatchNotify(action, payload, req, origin, requestId);
    } else if (ns === 'automation' || (!ns && action === 'evaluate')) {
      result = await dispatchAutomation(action, payload, req, origin, requestId);
    }

    if (result === null || result === undefined) {
      return jsonRes({
        error: `Unknown action: ${rawAction}`,
        available: {
          cleanup: [...CLEANUP_INTERNAL, ...CLEANUP_ADMIN],
          notify: [...Object.keys(NOTIFY_DIRECT), ...Object.keys(NOTIFY_PROXY)],
          automation: ['evaluate'],
        },
      }, 404, origin);
    }

    // If result is already a Response (from proxy or auth error), return it
    if (result instanceof Response) return result;

    const durationMs = Date.now() - startedAt;
    logger.info(`[${requestId}] ops-router: ${rawAction} done in ${durationMs}ms`);

    // Observability log
    try {
      const supabase = mkClient();
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: `ops-router:${rawAction}`,
        p_success: true,
        p_duration_ms: durationMs,
        p_result: result,
        p_processed_count: (result as any)?.total_cleaned ?? (result as any)?.cleaned ?? (result as any)?.deleted_count ?? (result as any)?.evaluated ?? 0,
        p_job_source: ns === 'cleanup' && CLEANUP_INTERNAL.has(action) ? 'cron' : 'admin',
      });
    } catch (_) { /* non-critical */ }

    return jsonRes({ ...(result as Record<string, unknown>), requestId, action: rawAction, duration_ms: durationMs }, 200, origin);

  } catch (error) {
    logger.error(`[${requestId}] ops-router error:`, error);
    return jsonRes({ success: false, error: error instanceof Error ? error.message : 'Unknown error', requestId }, 500, origin);
  }
});
