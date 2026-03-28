/**
 * AI Router — Consolidated dispatcher for AI edge functions.
 * 
 * Frontend calls this single endpoint with { action, payload }.
 * The router validates auth via serveTenant, then proxies to the
 * corresponding individual AI function internally.
 * 
 * This avoids duplicating logic while giving a unified entry point.
 * Original functions remain deployed for backward compatibility
 * and internal/cron callers.
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RouterSchema = z.object({
  action: z.string().min(1).max(64),
  payload: z.record(z.unknown()).optional().default({}),
});

// Map action names to their corresponding edge function names
const ACTION_TO_FUNCTION: Record<string, string> = {
  'analyze-agent': 'ai-analyze-agent',
  'behavioral-anomaly-detector': 'ai-behavioral-anomaly-detector',
  'correlate-alerts': 'ai-correlate-alerts',
  'execute-solution': 'ai-execute-solution',
  'quality-check': 'ai-quality-check',
  'red-team-assessment': 'ai-red-team-assessment',
  'security-copilot': 'ai-security-copilot',
  'system-audit': 'ai-system-audit',
  'agent-assist': 'ai-agent-assist',
  'action-executor': 'ai-action-executor',
  'insight-dispatcher': 'ai-insight-dispatcher',
  'predict-agent-failure': 'ai-predict-agent-failure',
  'system-analyzer': 'ai-system-analyzer',
  'full-audit': 'ai-full-audit',
  'get-insights': 'ai-get-insights',
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
  const functionName = ACTION_TO_FUNCTION[action];

  if (!functionName) {
    return new Response(
      JSON.stringify({ error: `Unknown action: ${action}`, available: Object.keys(ACTION_TO_FUNCTION) }),
      { status: 404, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[${requestId}] ai-router dispatching action=${action} → ${functionName}`);

  try {
    // Forward the request to the individual function with the original auth headers
    const targetUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    };

    // Forward auth header
    const authHeader = req.headers.get('Authorization');
    if (authHeader) {
      headers['Authorization'] = authHeader;
    }

    // Forward apikey header
    const apiKey = req.headers.get('apikey');
    if (apiKey) {
      headers['apikey'] = apiKey;
    }

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    // For streaming responses (e.g., security-copilot), pass through directly
    const contentType = response.headers.get('Content-Type') || 'application/json';
    if (contentType.includes('text/event-stream')) {
      return new Response(response.body, {
        status: response.status,
        headers: {
          'Content-Type': 'text/event-stream',
          'Cache-Control': 'no-cache',
          'Connection': 'keep-alive',
        },
      });
    }

    // For JSON responses, wrap with router metadata
    const responseBody = await response.text();
    
    if (!response.ok) {
      logger.error(`[${requestId}] ai-router: ${functionName} returned ${response.status}`);
      return new Response(responseBody, {
        status: response.status,
        headers: { 'Content-Type': 'application/json' },
      });
    }

    return new Response(responseBody, {
      status: 200,
      headers: { 'Content-Type': contentType },
    });

  } catch (error) {
    logger.error(`[${requestId}] ai-router dispatch error for ${action}:`, error);
    return new Response(
      JSON.stringify({ 
        error: 'Internal dispatch error', 
        action,
        message: error instanceof Error ? error.message : 'Unknown error',
      }),
      { status: 502, headers: { 'Content-Type': 'application/json' } }
    );
  }
}, { methods: ['POST'] });
