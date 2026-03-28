/**
 * notification-router — Consolidated notification dispatcher
 * 
 * Replaces individual notification functions with a single entry point.
 * Uses proxy dispatch to existing functions initially, with path to inline handlers.
 * 
 * Usage: POST /notification-router
 * Body: { "action": "email" | "telegram" | "whatsapp" | "webhook" | "dispatch" | "security", "payload": {...} }
 * 
 * Auth: Internal (X-Internal-Secret / service_role) or JWT with admin role
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RouterSchema = z.object({
  action: z.string().min(1).max(64),
  payload: z.record(z.unknown()).optional().default({}),
});

// Proxy targets: map action → existing function name
const PROXY_TARGETS: Record<string, string> = {
  'email':        'send-email-notification',
  'telegram':     'send-telegram-notification',
  'whatsapp':     'send-whatsapp-notification',
  'webhook':      'dispatch-webhook-notification',
  'security':     'send-security-notification',
  'dispatch':     'notification-dispatcher',
  'report':       'send-report-notification',
  'invite':       'send-invite',
  'welcome':      'send-welcome-email',
  'trial-reminder': 'send-trial-reminder',
  'scheduled-report': 'send-scheduled-report',
};

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }

  const requestId = crypto.randomUUID();

  // Auth: internal or JWT
  const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
  if (authError) return authError;

  try {
    const body = await req.json();
    const parsed = RouterSchema.safeParse(body);
    if (!parsed.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid request', details: parsed.error.flatten().fieldErrors }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    const { action, payload } = parsed.data;
    const functionName = PROXY_TARGETS[action];

    if (!functionName) {
      return new Response(
        JSON.stringify({ error: `Unknown action: ${action}`, available: Object.keys(PROXY_TARGETS) }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
      );
    }

    logger.info(`[${requestId}] notification-router: proxy → ${functionName} (action=${action})`);

    // Proxy to existing function
    const targetUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    };

    // Forward auth headers
    const authHeader = req.headers.get('Authorization');
    if (authHeader) headers['Authorization'] = authHeader;
    const apiKey = req.headers.get('apikey');
    if (apiKey) headers['apikey'] = apiKey;
    const internalSecret = req.headers.get('X-Internal-Secret');
    if (internalSecret) headers['X-Internal-Secret'] = internalSecret;

    const response = await fetch(targetUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify(payload),
    });

    const responseBody = await response.text();
    return new Response(responseBody, {
      status: response.status,
      headers: { ...corsHeaders, 'Content-Type': response.headers.get('Content-Type') || 'application/json' },
    });

  } catch (error) {
    logger.error(`[${requestId}] notification-router error:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: error instanceof Error ? error.message : 'Unknown', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
