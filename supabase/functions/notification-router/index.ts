/**
 * notification-router — Consolidated notification dispatcher
 * 
 * Replaces individual notification functions with a single entry point.
 * Uses DIRECT handlers for: email, telegram, whatsapp, webhook, welcome, security
 * Uses PROXY dispatch for: invite, dispatch, report, trial-reminder, scheduled-report
 * 
 * Usage: POST /notification-router
 * Body: { "action": "email" | "telegram" | ... , "payload": {...} }
 * 
 * Auth: Internal (X-Internal-Secret / service_role) or JWT with admin role
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

// Direct handlers (logic inlined from original functions)
import { handleEmail } from './handler-email.ts';
import { handleTelegram } from './handler-telegram.ts';
import { handleWhatsApp } from './handler-whatsapp.ts';
import { handleWebhook } from './handler-webhook.ts';
import { handleWelcome } from './handler-welcome.ts';
import { handleSecurity } from './handler-security.ts';

const RouterSchema = z.object({
  action: z.string().min(1).max(64),
  payload: z.record(z.unknown()).optional().default({}),
});

// Direct handler map (no HTTP hop)
const DIRECT_HANDLERS: Record<string, (payload: Record<string, unknown>, supabase: import('https://esm.sh/@supabase/supabase-js@2.74.0').SupabaseClient, requestId: string) => Promise<Record<string, unknown>>> = {
  'email': handleEmail,
  'telegram': handleTelegram,
  'whatsapp': handleWhatsApp,
  'webhook': handleWebhook,
  'welcome': handleWelcome,
  'security': handleSecurity,
};

// Proxy targets for complex functions (retain their own middleware/auth)
const PROXY_TARGETS: Record<string, string> = {
  'dispatch':        'notification-dispatcher',
  'report':          'send-report-notification',
  'invite':          'send-invite',
  'trial-reminder':  'send-trial-reminder',
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

    // === DIRECT HANDLER (no HTTP hop) ===
    const directHandler = DIRECT_HANDLERS[action];
    if (directHandler) {
      logger.info(`[${requestId}] notification-router: direct → ${action}`);
      const supabase = createClient(
        Deno.env.get('SUPABASE_URL')!,
        Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,
      );

      try {
        const result = await directHandler(payload, supabase, requestId);
        return new Response(JSON.stringify(result), {
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        });
      } catch (handlerError) {
        logger.error(`[${requestId}] notification-router handler ${action} error:`, handlerError);
        return new Response(
          JSON.stringify({ error: handlerError instanceof Error ? handlerError.message : 'Handler error', action }),
          { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
        );
      }
    }

    // === PROXY DISPATCH (for complex functions with own middleware) ===
    const functionName = PROXY_TARGETS[action];
    if (functionName) {
      logger.info(`[${requestId}] notification-router: proxy → ${functionName} (action=${action})`);

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
    }

    // Unknown action
    return new Response(
      JSON.stringify({
        error: `Unknown action: ${action}`,
        available_direct: Object.keys(DIRECT_HANDLERS),
        available_proxy: Object.keys(PROXY_TARGETS),
      }),
      { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );

  } catch (error) {
    logger.error(`[${requestId}] notification-router error:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: error instanceof Error ? error.message : 'Unknown', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
