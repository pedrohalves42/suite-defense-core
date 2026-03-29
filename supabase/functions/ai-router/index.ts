/**
 * AI Router ? Consolidated dispatcher for AI edge functions.
 * 
 * Hybrid approach:
 * - Direct handlers: For simpler AI functions (< 250 lines), logic is extracted
 *   into handlers/ and dispatched directly (no HTTP hop).
 * - Proxy dispatch: For complex functions (full-audit 783L, system-analyzer 833L,
 *   action-executor 719L) and internal-only functions, routes via HTTP proxy
 *   to preserve their existing architecture.
 * 
 * Frontend calls: POST /ai-router with { action, payload }
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { AIHandler } from './types.ts';

// Direct handlers (consolidated logic)
import { handleCorrelateAlerts } from './handlers/correlate-alerts.ts';
import { handleExecuteSolution } from './handlers/execute-solution.ts';
import { handleSecurityCopilot } from './handlers/security-copilot.ts';
import { handleGetInsights } from './handlers/get-insights.ts';
import { fetchWithTimeout } from '../_shared/fetch-with-timeout.ts';

/** Extended timeout for this function's external calls */
const FETCH_TIMEOUT_MS = 60000;

const RouterSchema = z.object({
  action: z.string().min(1).max(64),
  payload: z.record(z.unknown()).optional().default({}),
});

// ??? Direct handler map (no HTTP proxy) ??????????????????????????????????????
const DIRECT_HANDLERS: Record<string, AIHandler> = {
  'correlate-alerts': handleCorrelateAlerts,
  'execute-solution': handleExecuteSolution,
  'security-copilot': handleSecurityCopilot,
  'get-insights': handleGetInsights as AIHandler,
};

// ??? Proxy targets (complex functions that remain standalone) ????????????????
const PROXY_TARGETS: Record<string, string> = {
  'analyze-agent': 'ai-analyze-agent',
  'behavioral-anomaly-detector': 'ai-behavioral-anomaly-detector',
  'quality-check': 'ai-quality-check',
  'red-team-assessment': 'ai-red-team-assessment',
  'system-audit': 'ai-system-audit',
  'agent-assist': 'ai-agent-assist',
  'action-executor': 'ai-action-executor',
  'insight-dispatcher': 'ai-insight-dispatcher',
  'predict-agent-failure': 'ai-predict-agent-failure',
  'system-analyzer': 'ai-system-analyzer',
  'full-audit': 'ai-full-audit',
  'provider-status': 'ai-provider-status',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

serveTenant(async (req, ctx) => {
  const { body, requestId } = ctx;

  const parsed = RouterSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const { action, payload } = parsed.data;

  // ?? Try direct handler first ??
  const directHandler = DIRECT_HANDLERS[action];
  if (directHandler) {
    logger.info(`[${requestId}] ai-router: direct dispatch action=${action}`);
    try {
      const result = await directHandler(req, ctx, payload);
      if (result instanceof Response) return result;
      return new Response(JSON.stringify(result), {
        status: 200, headers: { 'Content-Type': 'application/json' },
      });
    } catch (error) {
      if (error instanceof Response) return error;
      logger.error(`[${requestId}] ai-router handler error for ${action}:`, error);
      return new Response(
        JSON.stringify({ error: 'Internal error', action, message: error instanceof Error ? error.message : 'Unknown' }),
        { status: 500, headers: { 'Content-Type': 'application/json' } }
      );
    }
  }

  // ?? Proxy to standalone function ??
  const functionName = PROXY_TARGETS[action];
  if (!functionName) {
    const allActions = [...Object.keys(DIRECT_HANDLERS), ...Object.keys(PROXY_TARGETS)];
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}`, available: allActions }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] ai-router: proxy dispatch action=${action} ? ${functionName}`);

  try {
    const targetUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    };

    const authHeader = req.headers.get('Authorization');
    if (authHeader) headers['Authorization'] = authHeader;
    const apiKey = req.headers.get('apikey');
    if (apiKey) headers['apikey'] = apiKey;

    const response = await fetchWithTimeout(targetUrl, { timeoutMs: FETCH_TIMEOUT_MS,
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const contentType = response.headers.get('Content-Type') || 'application/json';
    if (contentType.includes('text/event-stream')) {
      return new Response(response.body, {
        status: response.status,
        headers: { 'Content-Type': 'text/event-stream', 'Cache-Control': 'no-cache' },
      });
    }

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { 'Content-Type': contentType },
    });
  } catch (error) {
    logger.error(`[${requestId}] ai-router proxy error for ${action}:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal dispatch error', action, message: error instanceof Error ? error.message : 'Unknown' }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}, { methods: ['POST'] });
