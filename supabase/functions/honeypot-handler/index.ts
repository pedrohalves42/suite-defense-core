/**
 * honeypot-handler — Public endpoint for native honeypot interactions.
 * 
 * Uses serveHoneypot middleware with:
 * - 8 KB body cap, 1 KB snippet storage
 * - Header allowlist, IP hashing
 * - Bucket-based rate limit (fail-closed)
 * - Kill switch via feature flag HONEYPOT_ENABLED
 * - Tenant-scoped native agent attribution via path or round-robin
 * - EXACTLY 1 write per request (no agents.update in hot path)
 * 
 * Supported routes: POST /heartbeat, /poll-jobs, /submit-job-result
 * Everything else: 404 minimal JSON
 */

import { serveHoneypot } from '../_shared/serve-honeypot.ts';
import { buildHoneypotResponse } from '../_shared/honeypot/response-profiles.ts';
import { isFeatureEnabled } from '../_shared/feature-flags.ts';

const SUPPORTED_ROUTES = new Set(['/heartbeat', '/poll-jobs', '/submit-job-result']);

serveHoneypot(async (_req, ctx) => {
  const { supabase, requestId, bodySnippet, headersFiltered, sourceIpHash, sourceIpPrefix,
    classification, method, path, responseProfile } = ctx;

  // === KILL SWITCH (global + tenant) ===
  const honeypotEnabled = await isFeatureEnabled(supabase, 'HONEYPOT_ENABLED');
  if (!honeypotEnabled) {
    return new Response(
      JSON.stringify({ status: 'ok' }),
      { status: 200, headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId } },
    );
  }

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

  // === TENANT-SCOPED NATIVE AGENT ATTRIBUTION ===
  // Extract tenant hint from path if available: /honeypot/{tenant_id}/heartbeat
  // Otherwise, round-robin across all native honeypots using IP hash for determinism
  let tenantId: string | null = null;
  let agentId: string | null = null;

  // Try path-based tenant: /honeypot/{uuid}/route
  const tenantMatch = path.match(/\/honeypot\/([0-9a-f-]{36})\//i);
  
  if (tenantMatch) {
    // Tenant-scoped: pick a native honeypot for this tenant
    const { data: agent } = await supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('tenant_id', tenantMatch[1])
      .eq('honeypot_mode', 'native')
      .eq('status', 'active')
      .limit(1)
      .maybeSingle();
    
    if (agent) {
      tenantId = agent.tenant_id;
      agentId = agent.id;
    }
  }

  if (!tenantId) {
    // Fallback: get ALL native honeypots and pick one deterministically using IP hash
    const { data: nativeAgents } = await supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('honeypot_mode', 'native')
      .eq('status', 'active')
      .limit(50);

    if (nativeAgents && nativeAgents.length > 0) {
      // Deterministic selection: use first 8 chars of IP hash as index
      const hashIndex = parseInt(sourceIpHash.substring(0, 8), 16) % nativeAgents.length;
      const selected = nativeAgents[hashIndex];
      tenantId = selected.tenant_id;
      agentId = selected.id;
    }
  }

  // Build response before insert (minimize latency)
  const response = buildHoneypotResponse(route, method, responseProfile);

  // === EXACTLY 1 INSERT, NO agents.update ===
  // last_honeypot_interaction_at is derived from honeypot_interactions by cron/aggregation
  if (tenantId) {
    supabase
      .from('honeypot_interactions')
      .insert({
        tenant_id: tenantId,
        agent_id: agentId,
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
  }

  return new Response(JSON.stringify(response.body), {
    status: response.status,
    headers: { 'Content-Type': 'application/json', 'X-Request-ID': requestId },
  });
});
