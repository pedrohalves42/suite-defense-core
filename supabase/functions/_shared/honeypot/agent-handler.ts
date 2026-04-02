/**
 * Honeypot agent handler — handles requests from "flipped" agents.
 * 
 * This handler is invoked by the serveAgent gate when an authenticated
 * agent has honeypot_mode = 'flipped'. The agent's token is NOT revoked;
 * it authenticates normally but gets diverted here instead of real handlers.
 * 
 * Contract:
 * - Receives request AFTER authentication
 * - Registers interaction in honeypot_interactions
 * - Responds plausibly (mimics real backend)
 * - NEVER touches jobs, job_queue, or operational tables
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { truncateBody, filterHeaders } from './sanitize.ts';
import { classifyPayload } from './classify.ts';
import { buildHoneypotResponse } from './response-profiles.ts';
import { buildCorsHeaders } from '../cors.ts';
import { securityHeaders } from '../security-headers.ts';

export interface HoneypotAgentContext {
  agentId: string;
  agentName: string;
  tenantId: string;
  requestId: string;
  body: unknown;
  rawBody?: string;
  sourceIp: string;
}

/**
 * Handle a request from a flipped agent.
 * Records interaction and returns a plausible response.
 */
export async function handleHoneypotAgentRequest(
  req: Request,
  ctx: HoneypotAgentContext,
  supabase: SupabaseClient,
): Promise<Response> {
  const origin = req.headers.get('origin');
  const corsHeaders = buildCorsHeaders(origin);
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // 1. Sanitize and classify
  const bodySnippet = truncateBody(ctx.body);
  const headersFiltered = filterHeaders(req.headers);
  const { classification } = classifyPayload(bodySnippet, path, method);

  // 2. Record interaction (fire-and-forget to minimize latency)
  supabase
    .from('honeypot_interactions')
    .insert({
      tenant_id: ctx.tenantId,
      agent_id: ctx.agentId,
      mode: 'flipped',
      method,
      path,
      body_snippet: bodySnippet,
      headers_filtered: headersFiltered,
      source_ip: ctx.sourceIp,
      classification,
      trace_id: ctx.requestId,
    })
    .then(({ error }) => {
      if (error) {
        console.error(`[honeypot-agent] Failed to record interaction: ${error.message}`);
      }
    });

  // 3. Update last interaction timestamp (fire-and-forget)
  supabase
    .from('agents')
    .update({ last_honeypot_interaction_at: new Date().toISOString() })
    .eq('id', ctx.agentId)
    .then(({ error }) => {
      if (error) {
        console.error(`[honeypot-agent] Failed to update last_interaction: ${error.message}`);
      }
    });

  // 4. Build plausible response
  const response = buildHoneypotResponse(path, method);

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: {
      ...corsHeaders,
      ...securityHeaders,
      'Content-Type': 'application/json',
      'X-Request-ID': ctx.requestId,
    },
  });
}
