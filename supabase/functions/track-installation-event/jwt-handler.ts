/**
 * JWT-authenticated and anonymous fallback telemetry handlers.
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';
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

/** Handle anonymous telemetry (no auth headers) via agent name inference */
export async function handleAnonymousMode(
  req: Request,
  supabase: SupabaseClient,
  event: InstallationEvent,
  requestId: string,
  origin: string | null,
): Promise<Response> {
  logger.warn('[track-installation-event] No authentication provided, attempting inference', { requestId });

  try {
    const { data: existingAgent } = await supabase
      .from('agents')
      .select('id, tenant_id')
      .eq('agent_name', event.agent_name)
      .maybeSingle();

    if (existingAgent) {
      const { error: insertError } = await supabase.from('installation_analytics').insert({
        tenant_id: existingAgent.tenant_id,
        agent_id: existingAgent.id,
        agent_name: event.agent_name,
        event_type: event.event_type,
        platform: event.platform,
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
        logger.success('[track-installation-event] Telemetry tracked (anonymous with inference)', { requestId });
        return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
      }
      logger.error('[track-installation-event] Failed to insert anonymous telemetry', { error: insertError.message, requestId });
    }

    return makeResponse({ ok: false, tracked: false, reason: 'no_authentication_and_agent_not_found', requestId }, 200, origin);
  } catch (inferError) {
    logger.error('[track-installation-event] Inference failed', { error: inferError, requestId });
    return makeResponse({ ok: false, tracked: false, reason: 'inference_error', requestId }, 200, origin);
  }
}

/** Handle JWT-authenticated telemetry */
export async function handleJwtMode(
  req: Request,
  supabase: SupabaseClient,
  event: InstallationEvent,
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

  const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
  const user_agent = req.headers.get('user-agent') || 'unknown';

  let agent_id: string | null = null;
  try {
    const { data: agent } = await supabase
      .from('agents')
      .select('id')
      .eq('tenant_id', tenantId)
      .eq('agent_name', event.agent_name)
      .order('enrolled_at', { ascending: false })
      .limit(1)
      .maybeSingle();
    agent_id = agent?.id || null;
  } catch (err) {
    logger.debug('[track-installation-event] Agent lookup failed (non-critical)', { requestId, err });
  }

  const { error: insertError } = await supabase.from('installation_analytics').insert({
    tenant_id: tenantId,
    agent_id,
    agent_name: event.agent_name,
    event_type: event.event_type,
    platform: event.platform,
    installation_method: event.installation_method,
    installation_time_seconds: event.installation_time_seconds,
    error_message: event.error_message,
    ip_address,
    user_agent,
    metadata: event.metadata || {},
  });

  if (insertError) {
    logger.error('[track-installation-event] Insert failed', { requestId, code: insertError.code, message: insertError.message });
    return makeResponse({
      ok: false, tracked: false, reason: 'insert_failed', requestId,
      details: { code: insertError.code, message: insertError.message },
    }, 202, origin);
  }

  logger.success('[track-installation-event] Event tracked successfully', { requestId, eventType: event.event_type, agentName: event.agent_name });
  return makeResponse({ ok: true, tracked: true, requestId }, 200, origin);
}
