/**
 * Agent-token auth mode with HMAC validation for track-installation-event.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

interface InstallationEvent {
  agent_name: string;
  event_type: string;
  platform: string;
  installation_method?: string;
  installation_time_seconds?: number;
  error_message?: string;
  metadata?: Record<string, unknown>;
}

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

/**
 * Handle agent-token + HMAC authenticated telemetry.
 * Returns a Response, or null if this handler is not applicable.
 */
export async function handleAgentTokenMode(
  req: Request,
  supabase: SupabaseClient,
  event: InstallationEvent,
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
      // Fallback: enrollment key lookup
      const tokenPrefix = event.metadata?.token_prefix as string | undefined;
      if (!tokenPrefix) {
        logger.warn('[track-installation-event] No token found and no token prefix for fallback', { requestId });
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
        tenant_id: keyData.tenant_id,
        agent_id: null,
        agent_name: event.agent_name,
        event_type: event.event_type,
        platform: event.platform,
        installation_method: event.installation_method,
        error_message: event.error_message,
        metadata: { ...event.metadata, hmac_validation: 'skipped_fallback' },
        success: event.event_type !== 'installation_failed' && event.event_type !== 'failed',
        installation_time_seconds: event.installation_time_seconds,
        ip_address: req.headers.get('x-forwarded-for') || 'unknown',
        user_agent: req.headers.get('user-agent') || 'unknown',
      });

      logger.success('[track-installation-event] Telemetry tracked (fallback mode)', { requestId });
      return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
    }

    const agent = (Array.isArray(tokenData.agents) ? tokenData.agents[0] : tokenData.agents) as {
      id: string; tenant_id: string; agent_name: string; hmac_secret: string;
    };

    // Validate HMAC
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
    if (!hmacResult.valid) {
      logger.warn('[track-installation-event] HMAC validation failed', { requestId, errorCode: hmacResult.errorCode, agentName: agent.agent_name });
      return makeResponse({
        ok: false, tracked: false, reason: 'hmac_validation_failed', requestId,
        details: { code: hmacResult.errorCode, message: hmacResult.errorMessage },
      }, 200, origin);
    }

    // Insert telemetry
    const { error: insertError } = await supabase.from('installation_analytics').insert({
      tenant_id: agent.tenant_id,
      agent_id: agent.id,
      agent_name: agent.agent_name,
      event_type: event.event_type,
      platform: event.platform,
      installation_method: event.installation_method,
      success: event.event_type !== 'installation_failed' && event.event_type !== 'failed',
      installation_time_seconds: event.installation_time_seconds,
      error_message: event.error_message,
      metadata: { ...event.metadata, hmac_validation: 'success' },
      ip_address: req.headers.get('x-forwarded-for') || 'unknown',
      user_agent: req.headers.get('user-agent') || 'unknown',
    });

    if (insertError) {
      logger.error('[track-installation-event] Insert failed after HMAC validation', { requestId, error: insertError });
      return makeResponse({
        ok: false, tracked: false, reason: 'insert_failed', requestId,
        details: { code: insertError.code, message: insertError.message },
      }, 202, origin);
    }

    logger.success('[track-installation-event] Telemetry tracked with HMAC validation', { requestId, eventType: event.event_type, agentName: agent.agent_name });
    return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
  } catch (err) {
    logger.error('[track-installation-event] Agent-token mode error', { requestId, error: err });
    return makeResponse({ ok: false, tracked: false, reason: 'internal_error', requestId }, 202, origin);
  }
}
