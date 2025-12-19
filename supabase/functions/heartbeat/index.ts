import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'

Deno.serve(async (req) => {
  // QUAL-01: Proper HTTP method validation
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }
  
  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    const supabase = createClient(supabaseUrl, supabaseKey)

    // Verificar token do agente
    const agentToken = req.headers.get('X-Agent-Token')
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Token do agente necessario' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // CORRECAO: Interface explicita para OS info
    // FASE 2: Aceitar tanto os_type quanto platform (retrocompatibilidade)
    interface OSInfo {
      os_type?: string;
      platform?: string; // Legacy field
      os_version?: string;
      hostname?: string;
    }

    // Validar formato do token
    const tokenValidation = AgentTokenSchema.safeParse(agentToken)
    if (!tokenValidation.success) {
      return new Response(
        JSON.stringify({ error: 'Formato de token invalido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 400 }
      )
    }

    // FASE 2: Buscar agente pelo hash do token (não mais token em plaintext)
    const tokenHash = await hashToken(agentToken)
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, hmac_secret, status)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle()

    if (!token?.agents) {
      return new Response(
        JSON.stringify({ error: 'Token invalido' }),
        { headers: { ...corsHeaders, 'Content-Type': 'application/json' }, status: 401 }
      )
    }

    // CORRECAO: Schema garante agents como objeto unico com tipagem explicita
    const agent = token.agents as unknown as { 
      id: string; 
      agent_name: string; 
      hmac_secret: string; 
      status: string;
    }
    
    // FASE 1.2: HMAC OBRIGATORIO - Agora hmac_secret e NOT NULL
    if (!agent.hmac_secret) {
      logger.error('CRITICAL SECURITY: Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // Verificar HMAC (obrigatorio)
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      logger.warn('HMAC verification failed', { 
        agentName: agent.agent_name, 
        errorCode: hmacResult.errorCode,
        errorMessage: hmacResult.errorMessage,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
      })
      return new Response(
        JSON.stringify({ 
          error: 'unauthorized',
          code: hmacResult.errorCode,
          message: hmacResult.errorMessage,
          transient: hmacResult.transient
        }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // CRITICO: Parsear body DEPOIS da verificacao HMAC, usando o rawBody retornado
    let osInfo: OSInfo = {}
    if (hmacResult.rawBody) {
      try {
        const parsedBody = JSON.parse(hmacResult.rawBody)
        osInfo = parsedBody || {}
      } catch {
        // Body vazio ou invalido e OK para heartbeats legacy
      }
    }

    // Rate limiting: 3 req/min (heartbeat a cada 60s + margem para retry)
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'heartbeat', {
      maxRequests: 3,
      windowMinutes: 1,
      blockMinutes: 5,
    })

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit excedido',
          resetAt: rateLimitResult.resetAt 
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    logger.debug('Heartbeat received', { agentName: agent.agent_name })
    logger.info('Heartbeat received successfully')

    // CORRECAO: Interface explicita em vez de any
    interface AgentUpdate {
      last_heartbeat: string;
      status: string;
      os_type?: string;
      os_version?: string;
      hostname?: string;
      agent_version?: string;
    }

    const updateData: AgentUpdate = { 
      last_heartbeat: new Date().toISOString(),
      status: 'active'
    }
    
    // FASE 2: Aceitar os_type ou platform (retrocompatibilidade)
    if (osInfo.os_type || osInfo.platform) {
      updateData.os_type = osInfo.os_type || osInfo.platform
    }
    if (osInfo.os_version) {
      updateData.os_version = osInfo.os_version
    }
    if (osInfo.hostname) {
      updateData.hostname = osInfo.hostname
    }
    
    // FASE 4: Capturar agent_version do payload
    const agentVersion = (osInfo as any).agent_version as string | undefined;
    if (agentVersion) {
      updateData.agent_version = agentVersion;
    }

    const { error: updateError } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id)

    if (updateError) {
      // Log detalhado do erro mas nao bloqueia o heartbeat
      logger.error('Failed to update agent heartbeat', {
        error: updateError,
        errorMessage: updateError.message,
        errorDetails: updateError.details,
        errorHint: updateError.hint,
        agentId: agent.id,
        agentName: agent.agent_name,
        updateData: JSON.stringify(updateData)
      })
      // Continua mesmo com erro no UPDATE - heartbeat foi autenticado
      logger.warn('Heartbeat authenticated but update failed - continuing')
    } else {
      logger.success('Agent heartbeat updated successfully')
    }

    // Atualizar last_used_at do token (usando hash)
    await supabase
      .from('agent_tokens')
      .update({ last_used_at: new Date().toISOString() })
      .eq('token_hash', tokenHash)

    // ============================================================
    // FASE VIKTOR: FORCE UPDATE VIA HEARTBEAT RESPONSE
    // Se agent tem force_update_version pendente, incluir dados completos no response
    // Isso bypassa completamente o job system e funciona com agentes antigos
    // ============================================================
    const { data: forceCheck } = await supabase
      .from('agents')
      .select('force_update_version, force_update_reason')
      .eq('id', agent.id)
      .single()

    // Se tem force_update pendente, buscar release e incluir no response
    if (forceCheck?.force_update_version) {
      logger.info('Force update detected for agent', { 
        agentName: agent.agent_name, 
        targetVersion: forceCheck.force_update_version 
      })
      
      // Determinar plataforma (default windows para retrocompatibilidade)
      const platform = updateData.os_type || 'windows'
      
      const { data: release } = await supabase
        .from('agent_releases')
        .select('version, script_content, sha256')
        .eq('version', forceCheck.force_update_version)
        .eq('platform', platform)
        .eq('is_active', true)
        .single()

      if (release) {
        // Normalizar script para Windows (mesmo algoritmo do serve-agent-update)
        const normalizeForWindows = (content: string): string => {
          return content
            .replace(/\r\n/g, '\n')   
            .replace(/\r/g, '\n')     
            .replace(/\n/g, '\r\n');  
        };
        
        const normalizedScript = normalizeForWindows(release.script_content);
        
        // Encode Base64 usando Deno std (consistente com serve-agent-update)
        const encoder = new TextEncoder()
        const scriptBytes = encoder.encode(normalizedScript)
        const base64Script = encodeBase64(scriptBytes)
        
        // Calcular SHA256 do conteúdo normalizado (mesmo algoritmo do serve-agent-update)
        const hashBuffer = await crypto.subtle.digest('SHA-256', scriptBytes)
        const hashArray = Array.from(new Uint8Array(hashBuffer))
        const calculatedSha256 = hashArray.map(b => b.toString(16).padStart(2, '0')).join('')

        logger.info('Sending force update via heartbeat response', {
          agentName: agent.agent_name,
          targetVersion: release.version,
          platform,
          sha256: calculatedSha256.substring(0, 16) + '...'
        })

        return new Response(
          JSON.stringify({ 
            ok: true,
            agent: agent.agent_name,
            timestamp: new Date().toISOString(),
            // FORCE UPDATE DATA
            force_update: true,
            target_version: release.version,
            script_content_base64: base64Script,
            sha256: calculatedSha256,
            reason: forceCheck.force_update_reason || 'Forced update via backend'
          }),
          {
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
            status: 200
          }
        )
      } else {
        logger.warn('Force update version not found in agent_releases', {
          agentName: agent.agent_name,
          targetVersion: forceCheck.force_update_version,
          platform
        })
      }
    }

    // Response normal (sem force update)
    return new Response(
      JSON.stringify({ 
        ok: true,
        agent: agent.agent_name,
        timestamp: new Date().toISOString()
      }),
      {
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        status: 200
      }
    )
  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'heartbeat')
  }
})
