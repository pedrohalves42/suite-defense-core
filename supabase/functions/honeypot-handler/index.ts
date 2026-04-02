/**
 * honeypot-handler — Public endpoint for native honeypot interactions.
 * 
 * Uses serveHoneypot middleware (NOT servePublic) with:
 * - 8 KB body cap
 * - 1 KB snippet storage
 * - Header allowlist
 * - IP hashing
 * - Bucket-based rate limit
 * - No stack traces leaked
 * 
 * Supported routes:
 * - POST /heartbeat
 * - POST /poll-jobs
 * - POST /submit-job-result
 * - Everything else: 404 minimal JSON
 */

import { serveHoneypot } from '../_shared/serve-honeypot.ts';
import { buildHoneypotResponse } from '../_shared/honeypot/response-profiles.ts';

const SUPPORTED_ROUTES = new Set(['/heartbeat', '/poll-jobs', '/submit-job-result']);

serveHoneypot(async (_req, ctx) => {
  const { supabase, requestId, bodySnippet, headersFiltered, sourceIpHash, sourceIpPrefix,
    classification, method, path, responseProfile } = ctx;

  // Normalize route
  const segments = path.split('/').filter(Boolean);
  const route = segments.length > 0 ? '/' + segments[segments.length - 1] : '/';

  // Reject unsupported routes with minimal 404
  if (method !== 'POST' || !SUPPORTED_ROUTES.has(route)) {
    return new Response(
      JSON.stringify({ error: 'Not found' }),
      { status: 404, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } },
    );
  }

  // Find a native honeypot agent to attribute this interaction to
  const { data: honeypotAgent } = await supabase
    .from('agents')
    .select('id, tenant_id')
    .eq('honeypot_mode', 'native')
    .limit(1)
    .maybeSingle();

  // Build response before insert (latency)
  const response = buildHoneypotResponse(route, method, responseProfile);

  // Record interaction if we have a native honeypot (1 insert, fire-and-forget)
  if (honeypotAgent) {
    supabase
      .from('honeypot_interactions')
      .insert({
        tenant_id: honeypotAgent.tenant_id,
        agent_id: honeypotAgent.id,
        mode: 'native',
        method,
        path: route,
        status_code: response.status,
        body_snippet: bodySnippet,
        headers_filtered: headersFiltered,
        source_ip_hash: sourceIpHash,
        source_ip_prefix: sourceIpPrefix,
        classification,
        trace_id: requestId,
        response_profile: responseProfile,
      })
      .then(({ error }) => {
        if (error) console.error(`[honeypot-handler] Insert error: ${error.message}`);
      });

    // Update last interaction (fire-and-forget)
    supabase
      .from('agents')
      .update({ last_honeypot_interaction_at: new Date().toISOString() })
      .eq('id', honeypotAgent.id)
      .then(({ error }) => {
        if (error) console.error(`[honeypot-handler] Timestamp error: ${error.message}`);
      });
  }

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
  });
});
