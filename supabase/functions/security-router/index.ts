/**
 * security-router — Consolidated Security Operations Router
 * 
 * Routes: auto-block-threats, auto-quarantine, quarantine-agent,
 *   apply-security-patch, check-credential-leaks, check-failed-logins,
 *   clear-failed-logins, record-failed-login, detect-blocked-attempts,
 *   security-monitor, security-alert-dispatcher, build-security-graph,
 *   populate-security-graph, integrity-sentinel, verify-log-integrity,
 *   classify-shadow-it, scan-virus, scan-vulnerabilities, fetch-nvd-cves,
 *   translate-cve, sync-cve-database, publish-threat-ioc,
 *   threat-intelligence-lookup, correlate-edr-events, evaluate-edr-detections,
 *   mitre-sync, siem-export, run-rls-tests, security-advisor, security-cleanup-cron
 * 
 * Auth: JWT (admin) or internal caller, forwarded to sub-functions
 */
import { buildCorsHeaders } from '../_shared/cors.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

const FETCH_TIMEOUT_MS = 30000;
const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

const ACTION_TO_FUNCTION: Record<string, string> = {
  'auto-block-threats': 'auto-block-threats',
  'auto-quarantine': 'auto-quarantine',
  'quarantine-agent': 'quarantine-agent',
  'apply-security-patch': 'apply-security-patch',
  'check-credential-leaks': 'check-credential-leaks',
  'check-failed-logins': 'check-failed-logins',
  'clear-failed-logins': 'clear-failed-logins',
  'record-failed-login': 'record-failed-login',
  'detect-blocked-attempts': 'detect-blocked-attempts',
  'security-monitor': 'security-monitor',
  'security-alert-dispatcher': 'security-alert-dispatcher',
  'build-security-graph': 'build-security-graph',
  'populate-security-graph': 'populate-security-graph',
  'integrity-sentinel': 'integrity-sentinel',
  'verify-log-integrity': 'verify-log-integrity',
  'classify-shadow-it': 'classify-shadow-it',
  'scan-virus': 'scan-virus',
  'scan-vulnerabilities': 'scan-vulnerabilities',
  'fetch-nvd-cves': 'fetch-nvd-cves',
  'translate-cve': 'translate-cve',
  'sync-cve-database': 'sync-cve-database',
  'publish-threat-ioc': 'publish-threat-ioc',
  'threat-intelligence-lookup': 'threat-intelligence-lookup',
  'correlate-edr-events': 'correlate-edr-events',
  'evaluate-edr-detections': 'evaluate-edr-detections',
  'mitre-sync': 'mitre-sync',
  'siem-export': 'siem-export',
  'run-rls-tests': 'run-rls-tests',
  'security-advisor': 'security-advisor',
  'security-cleanup-cron': 'security-cleanup-cron',
};

const VALID_ACTIONS = new Set(Object.keys(ACTION_TO_FUNCTION));

const RouterSchema = z.object({
  action: z.string().min(1).max(60),
  payload: z.record(z.unknown()).optional().default({}),
});

function jsonRes(data: unknown, status: number, origin: string | null) {
  return new Response(JSON.stringify(data), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

function forwardHeaders(req: Request, requestId: string): Record<string, string> {
  const h: Record<string, string> = {
    'Content-Type': 'application/json',
    'X-Request-ID': requestId,
  };
  for (const name of ['Authorization', 'apikey', 'X-Internal-Secret', 'X-Agent-Token', 'X-HMAC-Signature', 'X-Timestamp', 'X-Nonce', 'x-cron-source']) {
    const v = req.headers.get(name);
    if (v) h[name] = v;
  }
  return h;
}

Deno.serve(async (req) => {
  const origin = req.headers.get('origin');
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID();
  const startedAt = Date.now();

  try {
    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) {
      return jsonRes({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }, 400, origin);
    }

    const { action, payload } = parsed.data;

    if (!VALID_ACTIONS.has(action)) {
      return jsonRes({ error: `Unknown action: ${action}`, valid_actions: [...VALID_ACTIONS] }, 400, origin);
    }

    const targetFn = ACTION_TO_FUNCTION[action];
    const url = `${SUPABASE_URL}/functions/v1/${targetFn}`;

    logger.info(`[security-router] Routing ${action} → ${targetFn}`, { requestId });

    const response = await fetchWithTimeout(url, {
      method: 'POST',
      headers: forwardHeaders(req, requestId),
      body: JSON.stringify(payload),
      timeoutMs: FETCH_TIMEOUT_MS,
    });

    const responseData = await response.text();
    const elapsed = Date.now() - startedAt;
    logger.info(`[security-router] ${action} completed in ${elapsed}ms (status: ${response.status})`);

    return new Response(responseData, {
      status: response.status,
      headers: { ...buildCorsHeaders(origin), 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });

  } catch (err) {
    logger.error('[security-router] Error:', err);
    return jsonRes({ error: 'Internal error', message: err instanceof Error ? err.message : 'Unknown' }, 500, origin);
  }
});
