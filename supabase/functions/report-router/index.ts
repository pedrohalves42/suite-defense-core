/**
 * report-router — Consolidated report generation dispatcher
 * 
 * Replaces individual generate-* functions with a single entry point.
 * 
 * Usage: POST /report-router
 * Body: { "action": "compliance" | "executive" | "explainable" | "security" | "weekly" | "auto" | "scheduled", "payload": {...} }
 * 
 * Auth: Internal (cron) or JWT with admin/super_admin role
 */

import { corsHeaders } from '../_shared/cors.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RouterSchema = z.object({
  action: z.string().min(1).max(64),
  payload: z.record(z.unknown()).optional().default({}),
});

const PROXY_TARGETS: Record<string, string> = {
  'compliance':   'generate-compliance-report',
  'executive':    'generate-executive-report',
  'explainable':  'generate-explainable-report',
  'security':     'generate-security-report',
  'weekly':       'generate-weekly-report',
  'auto':         'auto-generate-report',
  'scheduled':    'scheduled-report-generator',
  'list':         'list-reports',
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

    logger.info(`[${requestId}] report-router: proxy → ${functionName} (action=${action})`);

    const targetUrl = `${SUPABASE_URL}/functions/v1/${functionName}`;
    const headers: Record<string, string> = {
      'Content-Type': 'application/json',
      'X-Request-ID': requestId,
    };

    const authHeader = req.headers.get('Authorization');
    if (authHeader) headers['Authorization'] = authHeader;
    const apiKey = req.headers.get('apikey');
    if (apiKey) headers['apikey'] = apiKey;
    const internalSecret = req.headers.get('X-Internal-Secret');
    if (internalSecret) headers['X-Internal-Secret'] = internalSecret;
    // Forward agent token for list-reports
    const agentToken = req.headers.get('X-Agent-Token');
    if (agentToken) headers['X-Agent-Token'] = agentToken;
    // Forward HMAC headers
    const hmacSig = req.headers.get('X-HMAC-Signature');
    if (hmacSig) headers['X-HMAC-Signature'] = hmacSig;
    const timestamp = req.headers.get('X-Timestamp');
    if (timestamp) headers['X-Timestamp'] = timestamp;
    const nonce = req.headers.get('X-Nonce');
    if (nonce) headers['X-Nonce'] = nonce;

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
    logger.error(`[${requestId}] report-router error:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal error', message: error instanceof Error ? error.message : 'Unknown', requestId }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } },
    );
  }
});
