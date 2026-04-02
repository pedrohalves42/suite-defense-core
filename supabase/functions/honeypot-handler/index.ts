/**
 * honeypot-handler — Public endpoint for native honeypot agents.
 * 
 * Accepts requests at /honeypot-handler/* without strict authentication.
 * Simulates a real agent backend to attract and observe attackers.
 * 
 * Flow:
 * 1. Rate limit by source IP
 * 2. Parse and sanitize body
 * 3. Classify payload
 * 4. Record interaction
 * 5. Respond plausibly
 */

import { servePublic } from '../_shared/serve-public.ts';
import { truncateBody, filterHeaders, extractSourceIp } from '../_shared/honeypot/sanitize.ts';
import { classifyPayload } from '../_shared/honeypot/classify.ts';
import { buildHoneypotResponse } from '../_shared/honeypot/response-profiles.ts';
import { checkHoneypotRateLimit } from '../_shared/honeypot/rate-limit.ts';

servePublic(async (req, { supabase, requestId, body }) => {
  const sourceIp = extractSourceIp(req);
  const url = new URL(req.url);
  const path = url.pathname;
  const method = req.method;

  // 1. Rate limit by IP (5 req/min, block 15 min)
  const allowed = await checkHoneypotRateLimit(supabase, `ip:${sourceIp}`, {
    maxRequests: 5,
    windowMinutes: 1,
    blockMinutes: 15,
  });

  if (!allowed) {
    return new Response(
      JSON.stringify({ error: 'Too many requests' }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': '900' } },
    );
  }

  // 2. Sanitize
  const bodySnippet = truncateBody(body);
  const headersFiltered = filterHeaders(req.headers);

  // 3. Classify
  const { classification } = classifyPayload(bodySnippet, path, method);

  // 4. Find a native honeypot agent to attribute this to (pick any active one)
  const { data: honeypotAgent } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('honeypot_mode', 'native')
    .limit(1)
    .maybeSingle();

  if (!honeypotAgent) {
    // No native honeypots configured — respond but don't record
    const response = buildHoneypotResponse(path, method);
    return new Response(JSON.stringify(response.body), {
      status: response.status,
      headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
    });
  }

  // 5. Record interaction (fire-and-forget)
  supabase
    .from('honeypot_interactions')
    .insert({
      tenant_id: honeypotAgent.tenant_id,
      agent_id: honeypotAgent.id,
      mode: 'native',
      method,
      path,
      body_snippet: bodySnippet,
      headers_filtered: headersFiltered,
      source_ip: sourceIp,
      classification,
      trace_id: requestId,
    })
    .then(({ error }) => {
      if (error) console.error(`[honeypot-handler] Insert error: ${error.message}`);
    });

  // 6. Update last interaction timestamp
  supabase
    .from('agents')
    .update({ last_honeypot_interaction_at: new Date().toISOString() })
    .eq('id', honeypotAgent.id)
    .then(({ error }) => {
      if (error) console.error(`[honeypot-handler] Update error: ${error.message}`);
    });

  // 7. Respond plausibly
  const response = buildHoneypotResponse(path, method);
  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
  });
});
