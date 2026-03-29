import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { getTenantIdForUser } from '../_shared/tenant.ts';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { z } from 'https://deno.land/x/zod@v3.22.4/mod.ts';
import { hashToken } from '../_shared/token-hash.ts';

// Validation schema
const InstallationEventSchema = z.object({
  agent_name: z.string().trim().min(1).max(100),
  event_type: z.enum(['generated', 'downloaded', 'command_copied', 'installed', 'failed', 'post_installation', 'post_installation_unverified', 'installation_failed']),
  platform: z.enum(['windows', 'linux', 'macos']),
  installation_method: z.enum(['download', 'one_click', 'manual']).optional(),
  installation_time_seconds: z.number().int().positive().max(86400).optional(),
  error_message: z.string().max(500).optional(),
  metadata: z.record(z.any()).optional(),
});

type InstallationEvent = z.infer<typeof InstallationEventSchema>;

interface TelemetryResponse {
  ok: boolean;
  tracked: boolean;
  reason?: string;
  requestId: string;
  details?: {
    code?: string;
    message?: string;
    issues?: Array<{ path: string; message: string }>;
  };
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  const requestId = crypto.randomUUID();
  
  // Handle CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // P1 Fix: Rate limiting - 60 requests/min por IP
    const clientIp = req.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 
                     req.headers.get('x-real-ip') || 
                     'unknown';
    
    const rateLimitResult = await checkRateLimit(supabase, clientIp, 'track-installation-event', {
      maxRequests: 60,
      windowMinutes: 1,
      blockMinutes: 5
    });
    
    if (!rateLimitResult.allowed) {
      logger.warn('[track-installation-event] Rate limit exceeded', { 
        requestId, 
        ip: clientIp,
        resetAt: rateLimitResult.resetAt 
      });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'rate_limit_exceeded',
          requestId,
          details: { 
            message: 'Too many requests. Please try again later.',
            resetAt: rateLimitResult.resetAt?.toISOString()
          }
        } as TelemetryResponse),
        { 
          status: 429, 
          headers: { 
            ...buildCorsHeaders(origin), 
            'Content-Type': 'application/json',
            'Retry-After': '60'
          } 
        }
      );
    }

    // Parse JSON with error handling
    let body: any;
    try {
      body = await req.json();
      logger.debug('[track-installation-event] Payload received', { requestId, eventType: body?.event_type });
    } catch (jsonError) {
      logger.warn('[track-installation-event] Invalid JSON', { requestId });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'invalid_json',
          requestId,
          details: { message: 'Request body is not valid JSON' }
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
        }
      );
    }

    // Validate payload with zod
    const validation = InstallationEventSchema.safeParse(body);
    if (!validation.success) {
      const issues = validation.error.issues.map(issue => ({
        path: issue.path.join('.'),
        message: issue.message
      }));
      logger.warn('[track-installation-event] Invalid payload', { requestId, issues });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'invalid_payload',
          requestId,
          details: { issues }
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
        }
      );
    }

    const event: InstallationEvent = validation.data;

    // ===== MODO AGENT-TOKEN COM VALIDACAO HMAC COMPLETA (IGUAL AO HEARTBEAT) =====
    const agentToken = req.headers.get('X-Agent-Token');
    const hmacSignature = req.headers.get('X-HMAC-Signature');

    if (agentToken && hmacSignature) {
      logger.info('[track-installation-event] Using agent-token mode with HMAC validation', { requestId });
      
      try {
        // 1. BUSCAR AGENTE PELO TOKEN via hash (P0 security fix)
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
          // FALLBACK: Token nao encontrado, tentar enrollment key (instalacoes que falham antes de criar token)
          const tokenPrefix = event.metadata?.token_prefix as string | undefined;
          
          if (!tokenPrefix) {
            logger.warn('[track-installation-event] No token found and no token prefix for fallback', { requestId });
            return new Response(
              JSON.stringify({
                ok: false,
                tracked: false,
                reason: 'invalid_agent_token',
                requestId,
              } as TelemetryResponse),
              { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          }

          // Buscar tenant via enrollment key
          const { data: keyData } = await supabase
            .from('enrollment_keys')
            .select('tenant_id')
            .ilike('key', `${tokenPrefix}%`)
            .eq('is_active', true)
            .maybeSingle();

          if (!keyData) {
            logger.warn('[track-installation-event] No enrollment key found for fallback', { requestId, prefix: tokenPrefix });
            return new Response(
              JSON.stringify({
                ok: false,
                tracked: false,
                reason: 'enrollment_key_not_found',
                requestId,
              } as TelemetryResponse),
              { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          }

          // Inserir telemetria sem validacao HMAC (fallback para falhas early-stage)
          const { error: insertError } = await supabase
            .from('installation_analytics')
            .insert({
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

          if (insertError) {
            logger.error('[track-installation-event] Fallback insert failed', { requestId, error: insertError });
          }

          logger.success('[track-installation-event] Telemetry tracked (fallback mode)', { requestId });
          return new Response(
            JSON.stringify({
              ok: true,
              tracked: true,
              requestId
            } as TelemetryResponse),
            { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        const agent = (Array.isArray(tokenData.agents) ? tokenData.agents[0] : tokenData.agents) as { id: string; tenant_id: string; agent_name: string; hmac_secret: string };

        // 2. VALIDAR ASSINATURA HMAC (igual ao heartbeat)
        const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);

        if (!hmacResult.valid) {
          logger.warn('[track-installation-event] HMAC validation failed', { 
            requestId, 
            errorCode: hmacResult.errorCode,
            agentName: agent.agent_name 
          });

          // Retornar erro estruturado (nao 401 para telemetria)
          return new Response(
            JSON.stringify({
              ok: false,
              tracked: false,
              reason: 'hmac_validation_failed',
              requestId,
              details: { 
                code: hmacResult.errorCode, 
                message: hmacResult.errorMessage 
              }
            } as TelemetryResponse),
            { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        // 3. REGISTRAR TELEMETRIA COM CREDENCIAIS VALIDADAS
        const { error: insertError } = await supabase
          .from('installation_analytics')
          .insert({
            tenant_id: agent.tenant_id,
            agent_id: agent.id,
            agent_name: agent.agent_name,
            event_type: event.event_type, // Aceitar qualquer event_type
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
          return new Response(
            JSON.stringify({
              ok: false,
              tracked: false,
              reason: 'insert_failed',
              requestId,
              details: { code: insertError.code, message: insertError.message }
            } as TelemetryResponse),
            { status: 202, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          );
        }

        logger.success('[track-installation-event] Telemetry tracked with HMAC validation', { 
          requestId, 
          eventType: event.event_type,
          agentName: agent.agent_name 
        });
        return new Response(
          JSON.stringify({
            ok: true,
            tracked: true,
            requestId
          } as TelemetryResponse),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      } catch (err) {
        logger.error('[track-installation-event] Agent-token mode error', { requestId, error: err });
        return new Response(
          JSON.stringify({
            ok: false,
            tracked: false,
            reason: 'internal_error',
            requestId,
          } as TelemetryResponse),
          { status: 202, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }
    }

    // ===== FALLBACK: Modo compatibilidade (installers antigos sem auth) =====
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      // Tentar inferir tenant_id pelo agent_name (se agente ja existir)
      logger.warn('[track-installation-event] No authentication provided, attempting inference', { requestId });
      
      try {
        const { data: existingAgent } = await supabase
          .from('agents')
          .select('id, tenant_id')
          .eq('agent_name', event.agent_name)
          .maybeSingle();
        
        if (existingAgent) {
          // Registrar telemetria com tenant_id inferido
          const { error: insertError } = await supabase
            .from('installation_analytics')
            .insert({
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
              metadata: event.metadata || {}
            });
          
          if (insertError) {
            logger.error('[track-installation-event] Failed to insert anonymous telemetry', { 
              error: insertError.message, 
              requestId 
            });
          } else {
            logger.success('[track-installation-event] Telemetry tracked (anonymous with inference)', { requestId });
            return new Response(
              JSON.stringify({
                ok: true,
                tracked: true,
                requestId
              } as TelemetryResponse),
              { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          }
        }
        
        // Se nao conseguiu inferir, registrar sem tenant_id (para debug)
        logger.warn('[track-installation-event] Recording telemetry without tenant_id', { requestId });
        return new Response(
          JSON.stringify({
            ok: false,
            tracked: false,
            reason: 'no_authentication_and_agent_not_found',
            requestId
          } as TelemetryResponse),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      } catch (inferError) {
        logger.error('[track-installation-event] Inference failed', { error: inferError, requestId });
        return new Response(
          JSON.stringify({
            ok: false,
            tracked: false,
            reason: 'inference_error',
            requestId
          } as TelemetryResponse),
          { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }
    }
    
    // ===== FLUXO NORMAL: Auth via JWT =====

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);

    if (authError || !user) {
      logger.warn('[track-installation-event] Unauthorized', { requestId, error: authError?.message });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'unauthorized',
          requestId,
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
        }
      );
    }

    // Get tenant_id using helper
    const tenantId = await getTenantIdForUser(supabase, user.id);
    if (!tenantId) {
      logger.warn('[track-installation-event] No tenant for user', { requestId, userId: user.id });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'no_tenant',
          requestId,
        } as TelemetryResponse),
        { 
          status: 200, 
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
        }
      );
    }

    // Collect metadata
    const ip_address = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';
    const user_agent = req.headers.get('user-agent') || 'unknown';

    // Optional: Find agent_id if agent already exists
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
    } catch (lookupError) {
      // Non-critical, continue without agent_id
      logger.debug('[track-installation-event] Agent lookup failed (non-critical)', { requestId });
    }

    // Insert into installation_analytics using service role (bypasses RLS)
    const { error: insertError } = await supabase
      .from('installation_analytics')
      .insert({
        tenant_id: tenantId,
        agent_id: agent_id,
        agent_name: event.agent_name,
        event_type: event.event_type,
        platform: event.platform,
        installation_method: event.installation_method,
        installation_time_seconds: event.installation_time_seconds,
        error_message: event.error_message,
        ip_address,
        user_agent,
        metadata: event.metadata || {}
      });

    if (insertError) {
      logger.error('[track-installation-event] Insert failed', { 
        requestId, 
        code: insertError.code, 
        message: insertError.message 
      });
      return new Response(
        JSON.stringify({
          ok: false,
          tracked: false,
          reason: 'insert_failed',
          requestId,
          details: {
            code: insertError.code,
            message: insertError.message
          }
        } as TelemetryResponse),
        { 
          status: 202, // Accepted but not processed
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
        }
      );
    }

    logger.success('[track-installation-event] Event tracked successfully', { 
      requestId, 
      eventType: event.event_type,
      agentName: event.agent_name 
    });

    return new Response(
      JSON.stringify({
        ok: true,
        tracked: true,
        requestId
      } as TelemetryResponse),
      { 
        status: 200, 
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    // Catch-all for unexpected errors - NEVER return 500 for telemetry
    logger.error('[track-installation-event] Unexpected error', { requestId, error });
    return new Response(
      JSON.stringify({
        ok: false,
        tracked: false,
        reason: 'unexpected_error',
        requestId,
        details: {
          message: error instanceof Error ? error.message : 'Unknown error'
        }
      } as TelemetryResponse),
      { 
        status: 202,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      }
    );
  }
});
