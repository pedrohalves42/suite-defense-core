/**
 * get-reinstall-by-name - Returns preserve-reinstall PS1 script
 * MODULARIZED: auth-resolver.ts and script-builder.ts
 * 
 * Auth: Deno.serve (enrollment key or JWT)
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { logger } from '../_shared/logger.ts';
import { resolveAuth } from './auth-resolver.ts';
import { buildReinstallScript } from './script-builder.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return new Response(null, { headers: buildCorsHeaders(origin) });

  const requestId = crypto.randomUUID();

  try {
    const url = new URL(req.url);
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const serviceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const adminClient = createClient(supabaseUrl, serviceKey);

    // Extract agent name
    const pathParts = url.pathname.split('/');
    const pathName = decodeURIComponent(pathParts[pathParts.length - 1] || '').trim();
    const queryName = url.searchParams.get('name')?.trim() || '';
    const agentName = (pathName && pathName !== 'get-reinstall-by-name') ? pathName : queryName;

    if (!agentName) {
      return new Response('# ERROR: Missing agent name in URL\nWrite-Host "ERROR: Specify agent name in URL" -ForegroundColor Red\n', { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Authenticate
    const auth = await resolveAuth(req, url, adminClient, supabaseUrl, requestId, origin);
    if (auth.response) return auth.response;
    if (!auth.tenantId) {
      return new Response('# ERROR: Could not determine tenant\nWrite-Host "ERROR: No tenant" -ForegroundColor Red\n', { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    logger.info(`[${requestId}] Reinstall-by-name for agent: ${agentName}, tenant: ${auth.tenantId}`);

    // Find agent
    const { data: agent, error: agentError } = await adminClient.from('agents').select('id, agent_name, hmac_secret, tenant_id').eq('agent_name', agentName).eq('tenant_id', auth.tenantId).maybeSingle();
    if (agentError || !agent) {
      return new Response(`# ERROR: Agent "${agentName}" not found in your tenant\nWrite-Host "ERROR: Agent not found: ${agentName}" -ForegroundColor Red\n`, { status: 404, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Generate fresh token
    const freshToken = crypto.randomUUID();
    const tokenHash = await hashToken(freshToken);
    const tokenPrefix = freshToken.substring(0, 8);

    await adminClient.from('agent_tokens').update({ is_active: false }).eq('agent_id', agent.id);
    const tokenExpiresAt = new Date(Date.now() + 365 * 24 * 60 * 60 * 1000).toISOString();
    const { error: tokenError } = await adminClient.from('agent_tokens').insert({ agent_id: agent.id, token_hash: tokenHash, token_prefix: tokenPrefix, expires_at: tokenExpiresAt, is_active: true });
    if (tokenError) {
      return new Response('# ERROR: Failed to generate credentials\nWrite-Host "ERROR: Token creation failed" -ForegroundColor Red\n', { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    // Audit log
    adminClient.from('audit_logs').insert({ action: 'reinstall_by_name', resource_type: 'agent', resource_id: agent.id, tenant_id: agent.tenant_id, details: { agent_name: agentName, token_prefix: tokenPrefix }, success: true }).then(() => {});

    // Get latest script
    const { data: release } = await adminClient.from('agent_releases').select('script_content, version').eq('platform', 'windows').eq('is_active', true).order('created_at', { ascending: false }).limit(1).maybeSingle();
    if (!release?.script_content) {
      return new Response('# ERROR: No active agent script found\nWrite-Host "ERROR: No script available" -ForegroundColor Red\n', { status: 503, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } });
    }

    const script = buildReinstallScript(agentName, freshToken, agent.hmac_secret || '', supabaseUrl, release.version || 'unknown', release.script_content);

    return new Response(script, { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache, no-store, must-revalidate' } });
  } catch (error) {
    logger.error(`[${requestId}] Error:`, error);
    return new Response(`# ERROR: ${error instanceof Error ? error.message : 'Internal error'}\nWrite-Host "ERROR: Internal server error" -ForegroundColor Red\n`, { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'text/plain; charset=utf-8' } });
  }
});
