/**
 * track-installation-event handler — Inlined into public-gateway (Phase 6D)
 * Tracks agent installation telemetry with multiple auth modes.
 */
import { logger } from '../../_shared/logger.ts';
import { checkRateLimit } from '../../_shared/rate-limit.ts';
import { verifyHmacSignature } from '../../_shared/hmac.ts';
import { hashToken } from '../../_shared/token-hash.ts';
import { getTenantIdForUser } from '../../_shared/tenant.ts';
import { buildCorsHeaders } from '../../_shared/cors.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const InstallationEventSchema = z.object({
  agent_name: z.string().trim().min(1).max(100),
  event_type: z.enum(['generated', 'downloaded', 'command_copied', 'installed', 'failed', 'post_installation', 'post_installation_unverified', 'installation_failed']),
  platform: z.enum(['windows', 'linux', 'macos']),
  installation_method: z.enum(['download', 'one_click', 'manual']).optional(),
  installation_time_seconds: z.number().int().positive().max(86400).optional(),
  error_message: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

interface TelemetryResponse {
  ok: boolean;
  tracked: boolean;
  reason?: string;
  requestId: string;
  details?: Record<string, unknown>;
}

function makeResponse(body: TelemetryResponse, status: number, origin: string | null): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
  });
}

export async function handleTrackInstallationEvent(
  supabase: SupabaseClient,
  req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response> {
  const origin = req.headers.get('origin');

  // Rate limiting
  const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || req.headers.get('x-real-ip') || 'unknown';
  const rateLimitResult = await checkRateLimit(supabase, clientIp, 'track-installation-event', { maxRequests: 60, windowMinutes: 1, blockMinutes: 5 });
  if (!rateLimitResult.allowed) {
    return makeResponse({ ok: false, tracked: false, reason: 'rate_limit_exceeded', requestId, details: { message: 'Too many requests.', resetAt: rateLimitResult.resetAt?.toISOString() } }, 429, origin);
  }

  // Validate
  const validation = InstallationEventSchema.safeParse(payload);
  if (!validation.success) {
    const issues = validation.error.issues.map(i => ({ path: i.path.join('.'), message: i.message }));
    return makeResponse({ ok: false, tracked: false, reason: 'invalid_payload', requestId, details: { issues } }, 200, origin);
  }

  const event = validation.data;

  // Agent-token mode with HMAC
  const agentToken = req.headers.get('X-Agent-Token');
  const hmacSignature = req.headers.get('X-HMAC-Signature');

  if (agentToken && hmacSignature) {
    return await handleAgentTokenMode(req, supabase, event, agentToken, requestId, origin);
  }

  // Anonymous fallback (no auth)
  const authHeader = req.headers.get('Authorization');
  if (!authHeader) {
    return await handleAnonymousMode(req, supabase, event, requestId, origin);
  }

  // JWT mode
  const token = authHeader.replace('Bearer ', '');
  return await handleJwtMode(req, supabase, event, token, requestId, origin);
}

// === Agent Token Mode ===
async function handleAgentTokenMode(
  req: Request,
  supabase: SupabaseClient,
  event: z.infer<typeof InstallationEventSchema>,
  agentToken: string,
  requestId: string,
  origin: string | null,
): Promise<Response> {
  try {
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, tenant_id, agent_name, hmac_secret)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (!tokenData?.agents) {
      const tokenPrefix = event.metadata?.token_prefix as string | undefined;
      if (!tokenPrefix) {
        return makeResponse({ ok: false, tracked: false, reason: 'invalid_agent_token', requestId }, 200, origin);
      }

      const { data: keyData } = await supabase
        .from('enrollment_keys')
        .select('tenant_id')
        .ilike('key', `${tokenPrefix}%`)
        .eq('is_active', true)
        .maybeSingle();

      if (!keyData) {
        return makeResponse({ ok: false, tracked: false, reason: 'enrollment_key_not_found', requestId }, 200, origin);
      }

      await supabase.from('installation_analytics').insert({
        tenant_id: keyData.tenant_id, agent_id: null, agent_name: event.agent_name,
        event_type: event.event_type, platform: event.platform,
        installation_method: event.installation_method, error_message: event.error_message,
        metadata: { ...event.metadata, hmac_validation: 'skipped_fallback' },
        success: event.event_type !== 'installation_failed' && event.event_type !== 'failed',
        installation_time_seconds: event.installation_time_seconds,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
      });

      return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
    }

    const agent = (Array.isArray(tokenData.agents) ? tokenData.agents[0] : tokenData.agents) as {
      id: string; tenant_id: string; agent_name: string; hmac_secret: string;
    };

    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
    if (!hmacResult.valid) {
      return makeResponse({
        ok: false, tracked: false, reason: 'hmac_validation_failed', requestId,
        details: { code: hmacResult.errorCode, message: hmacResult.errorMessage },
      }, 200, origin);
    }

    const { error: insertError } = await supabase.from('installation_analytics').insert({
      tenant_id: agent.tenant_id, agent_id: agent.id, agent_name: agent.agent_name,
      event_type: event.event_type, platform: event.platform,
      installation_method: event.installation_method,
      success: event.event_type !== 'installation_failed' && event.event_type !== 'failed',
      installation_time_seconds: event.installation_time_seconds,
      error_message: event.error_message,
      metadata: { ...event.metadata, hmac_validation: 'success' },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
    });

    if (insertError) {
      return makeResponse({ ok: false, tracked: false, reason: 'insert_failed', requestId, details: { code: insertError.code, message: insertError.message } }, 202, origin);
    }

    return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
  } catch (err) {
    logger.error('[track-installation-event] Agent-token mode error', { requestId, error: err });
    return makeResponse({ ok: false, tracked: false, reason: 'internal_error', requestId }, 202, origin);
  }
}

// === Anonymous Mode ===
async function handleAnonymousMode(
  req: Request,
  supabase: SupabaseClient,
  event: z.infer<typeof InstallationEventSchema>,
  requestId: string,
  origin: string | null,
): Promise<Response> {
  try {
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('agent_name', event.agent_name)
      .maybeSingle();

    if (existingAgent) {
      const { error: insertError } = await supabase.from('installation_analytics').insert({
        tenant_id: existingAgent.tenant_id, agent_id: existingAgent.id,
        agent_name: event.agent_name, event_type: event.event_type, platform: event.platform,
        installation_method: event.installation_method,
        success: event.event_type !== 'installation_failed' && event.event_type !== 'failed',
        installation_time_seconds: event.installation_time_seconds,
        error_message: event.error_message,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
        network_connectivity: true,
        metadata: event.metadata || {},
      });

      if (!insertError) {
        return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
      }
    }

    return makeResponse({ ok: false, tracked: false, reason: 'no_authentication_and_agent_not_found', requestId }, 200, origin);
  } catch {
    return makeResponse({ ok: false, tracked: false, reason: 'inference_error', requestId }, 200, origin);
  }
}

// === JWT Mode ===
async function handleJwtMode(
  req: Request,
  supabase: SupabaseClient,
  event: z.infer<typeof InstallationEventSchema>,
  token: string,
  requestId: string,
  origin: string | null,
): Promise<Response> {
  const { data: { user }, error: authError } = await supabase.auth.getUser(token);

  if (authError || !user) {
    return makeResponse({ ok: false, tracked: false, reason: 'unauthorized', requestId }, 200, origin);
  }

  const tenantId = await getTenantIdForUser(supabase, user.id);
  if (!tenantId) {
    return makeResponse({ ok: false, tracked: false, reason: 'no_tenant', requestId }, 200, origin);
  }

  let agent_id: string | null = null;
  try {
    const { data: agent } = await supabase
      .from('agents').select('id').eq('tenant_id', tenantId).eq('agent_name', event.agent_name)
      .order('enrolled_at', { ascending: false }).limit(1).maybeSingle();
    agent_id = agent?.id || null;
  } catch { /* non-critical */ }

  const { error: insertError } = await supabase.from('installation_analytics').insert({
    tenant_id: tenantId, agent_id, agent_name: event.agent_name,
    event_type: event.event_type, platform: event.platform,
    installation_method: event.installation_method,
    installation_time_seconds: event.installation_time_seconds,
    error_message: event.error_message,
    ip_address: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown',
    user_agent: req.headers.get('user-agent') || 'unknown',
    metadata: event.metadata || {},
  });

  if (insertError) {
    return makeResponse({ ok: false, tracked: false, reason: 'insert_failed', requestId, details: { code: insertError.code, message: insertError.message } }, 202, origin);
  }

  return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
}
