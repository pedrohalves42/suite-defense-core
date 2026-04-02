/**
 * Honeypot agent handler — handles requests from "flipped" agents.
 * 
 * Invoked by the serveAgent gate when an authenticated agent has
 * honeypot_mode = 'flipped'. The agent's token is NOT revoked;
 * it authenticates normally but gets diverted here.
 * 
 * Contract:
 * - Receives request AFTER authentication
 * - Checks kill switch (HONEYPOT_ENABLED feature flag)
 * - Registers interaction in honeypot_interactions (1 insert)
 * - Responds plausibly (mimics real backend)
 * - NEVER touches jobs, job_queue, job_results, automation_rules, or any operational table
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { truncateBody, filterHeaders, extractSourceIp, hashIp, extractIpPrefix } from './sanitize.ts';
import { classifyPayload } from './classify.ts';
import { buildHoneypotResponse, type ResponseProfileType } from './response-profiles.ts';
import { buildCorsHeaders } from '../cors.ts';
import { securityHeaders } from '../security-headers.ts';
import { isFeatureEnabled } from '../feature-flags.ts';

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
 * Checks kill switch, records interaction (1 insert) and returns a plausible response.
 */
export async function handleHoneypotAgentRequest(
  req: Request,
  ctx: HoneypotAgentContext,
  supabase: SupabaseClient,
): Promise<Response> {
  const origin = req.headers.get('origin');
  const cors = buildCorsHeaders(origin);
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // === KILL SWITCH ===
  const honeypotEnabled = await isFeatureEnabled(supabase, 'HONEYPOT_ENABLED', ctx.tenantId);
  if (!honeypotEnabled) {
    // If honeypot is disabled, return neutral response without recording
    return new Response(JSON.stringify({ status: 'ok' }), {
      status: 200,
      headers: { ...cors, ...securityHeaders, 'Content-Type': 'application/json', 'X-Request-ID': ctx.requestId },
    });
  }

  // 1. Sanitize (allowlist headers, truncate body, hash IP)
  const bodySnippet = truncateBody(ctx.body);
  const headersFiltered = filterHeaders(req.headers);
  const { classification } = classifyPayload(bodySnippet, path, method);
  const sourceIpHash = await hashIp(ctx.sourceIp);
  const sourceIpPrefix = extractIpPrefix(ctx.sourceIp);

  // 2. Build response BEFORE insert (minimize latency)
  const profile: ResponseProfileType = 'default';
  const response = buildHoneypotResponse(path, method, profile);

  // 3. Single insert (fire-and-forget) — 1 write per request
  const now = new Date().toISOString();
  supabase
    .from('honeypot_interactions')
    .insert({
      tenant_id: ctx.tenantId,
      agent_id: ctx.agentId,
      mode: 'flipped',
      method,
      path,
      status_code: response.status,
      body_snippet: bodySnippet,
      headers_filtered: headersFiltered,
      source_ip_hash: sourceIpHash,
      source_ip_prefix: sourceIpPrefix,
      classification,
      trace_id: ctx.requestId,
      response_profile: profile,
    })
    .then(({ error }) => {
      if (error) console.error(`[honeypot-agent] Insert error: ${error.message}`);
    });

  // 4. Update last interaction timestamp (fire-and-forget, lightweight)
  supabase
    .from('agents')
    .update({ last_honeypot_interaction_at: now })
    .eq('id', ctx.agentId)
    .then(({ error }) => {
      if (error) console.error(`[honeypot-agent] Timestamp update error: ${error.message}`);
    });

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: {
      ...cors,
      ...securityHeaders,
      'Content-Type': 'application/json',
      'X-Request-ID': ctx.requestId,
    },
  });
}
