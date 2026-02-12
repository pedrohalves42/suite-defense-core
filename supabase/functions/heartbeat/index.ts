import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts'

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
    
    // Verificar HMAC - try verification, but allow through if headers are missing
    // COMPAT: v5.0.3 agents only send HMAC headers when body is present
    // Heartbeats without body will have no HMAC headers
    const hasHmacHeaders = req.headers.get('X-HMAC-Signature') || req.headers.get('X-Timestamp') || req.headers.get('X-HMAC-Timestamp')
    
    let hmacResult: { valid: boolean; rawBody?: string; errorCode?: string; errorMessage?: string; transient?: boolean }
    
    if (hasHmacHeaders) {
      // HMAC headers present - try to verify
      hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
      if (!hmacResult.valid) {
        // COMPAT: v5.0.3 has HMAC encoding bugs - accept heartbeat with token-only auth
        // Log the failure but don't block the heartbeat
        logger.warn('HMAC verification failed but accepting heartbeat (token-authenticated)', { 
          agentName: agent.agent_name, 
          errorCode: hmacResult.errorCode,
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
        })
        // Re-read body since verifyHmacSignature consumed it
        let rawBody = ''
        try { rawBody = hmacResult.rawBody || '' } catch { rawBody = '' }
        hmacResult = { valid: true, rawBody }
      }
    } else {
      // No HMAC headers - agent authenticated by token only (v5.0.3 no-body heartbeat)
      // Read body manually since verifyHmacSignature won't be called
      let rawBody = ''
      try {
        rawBody = await req.clone().text()
      } catch { rawBody = '' }
      hmacResult = { valid: true, rawBody }
      logger.warn('Heartbeat accepted without HMAC (token-only auth)', { 
        agentName: agent.agent_name,
        ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
      })
    }

    // CRITICO: Parsear body DEPOIS da verificacao HMAC, usando o rawBody retornado
    let osInfo: OSInfo = {}
    if (hmacResult.rawBody) {
      try {
        const parsedBody = JSON.parse(hmacResult.rawBody)
        osInfo = parsedBody || {}
        // DEBUG: Log payload keys to verify what agent sends
        logger.info('Heartbeat payload keys', { 
          agentName: agent.agent_name, 
          keys: Object.keys(osInfo),
          hasSystemMetrics: !!(osInfo as any).system_metrics,
          bodyLength: hmacResult.rawBody.length
        })
      } catch {
        // Body vazio ou invalido e OK para heartbeats legacy
        logger.debug('Empty/invalid heartbeat body', { agentName: agent.agent_name, bodyLength: hmacResult.rawBody?.length })
      }
    } else {
      logger.debug('No body in heartbeat', { agentName: agent.agent_name })
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
      ed25519_supported?: boolean;
      signature_mode?: string;
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
    
    // FASE 5: Capturar Ed25519 capability flags do payload
    const ed25519Supported = (osInfo as any).ed25519_supported as boolean | undefined;
    const signatureMode = (osInfo as any).signature_mode as string | undefined;
    if (ed25519Supported !== undefined) {
      updateData.ed25519_supported = ed25519Supported;
    }
    if (signatureMode) {
      updateData.signature_mode = signatureMode;
    }

    const { error: updateError } = await supabase
      .from('agents')
      .update(updateData)
      .eq('id', agent.id)

    if (updateError) {
      logger.error('Failed to update agent heartbeat', {
        error: updateError,
        errorMessage: updateError.message,
        errorDetails: updateError.details,
        errorHint: updateError.hint,
        agentId: agent.id,
        agentName: agent.agent_name,
        updateData: JSON.stringify(updateData)
      })
      logger.warn('Heartbeat authenticated but update failed - continuing')
    } else {
      logger.success('Agent heartbeat updated successfully')
    }

    // ============================================================
    // SAVE SYSTEM METRICS from heartbeat payload
    // v5 agents send system_metrics with CPU/RAM/Disk data
    // ============================================================
    const systemMetrics = (osInfo as any).system_metrics
    logger.info('Metrics extraction check', { agentName: agent.agent_name, hasMetrics: !!systemMetrics, metricsType: typeof systemMetrics, hasError: systemMetrics?.error })
    if (systemMetrics && typeof systemMetrics === 'object' && !systemMetrics.error) {
      // Get tenant_id for the agent
      const { data: agentTenant } = await supabase
        .from('agents')
        .select('tenant_id')
        .eq('id', agent.id)
        .single()

      if (agentTenant?.tenant_id) {
        const metricsRow = {
          agent_id: agent.id,
          tenant_id: agentTenant.tenant_id,
          cpu_usage_percent: systemMetrics.cpu_percent ?? null,
          cpu_name: systemMetrics.cpu_name ?? null,
          cpu_cores: systemMetrics.cpu_cores ?? null,
          memory_total_gb: systemMetrics.memory_total_gb ?? null,
          memory_used_gb: systemMetrics.memory_used_gb ?? null,
          memory_free_gb: systemMetrics.memory_free_gb != null 
            ? systemMetrics.memory_free_gb 
            : (systemMetrics.memory_total_gb != null && systemMetrics.memory_used_gb != null 
              ? Math.round((systemMetrics.memory_total_gb - systemMetrics.memory_used_gb) * 100) / 100 
              : null),
          memory_usage_percent: systemMetrics.memory_used_percent ?? null,
          disk_total_gb: systemMetrics.disk_total_gb ?? null,
          disk_used_gb: systemMetrics.disk_total_gb != null && systemMetrics.disk_free_gb != null
            ? Math.round((systemMetrics.disk_total_gb - systemMetrics.disk_free_gb) * 100) / 100
            : null,
          disk_free_gb: systemMetrics.disk_free_gb ?? null,
          disk_usage_percent: systemMetrics.disk_used_percent ?? null,
          uptime_seconds: systemMetrics.uptime_seconds ?? null,
          collected_at: new Date().toISOString(),
        }

        logger.info('Inserting metrics', { agentName: agent.agent_name, cpu: metricsRow.cpu_usage_percent, ram: metricsRow.memory_usage_percent })

        const { error: metricsError } = await supabase
          .from('agent_system_metrics')
          .insert(metricsRow)

        if (metricsError) {
          logger.error('METRICS INSERT FAILED', { 
            agentName: agent.agent_name, 
            error: metricsError.message,
            code: metricsError.code,
            details: metricsError.details,
            hint: metricsError.hint
          })
        } else {
          logger.info('METRICS SAVED OK', { agentName: agent.agent_name })
        }
      } else {
        logger.warn('No tenant found for agent', { agentId: agent.id })
      }
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
      .select('force_update_version, force_update_reason, force_update_override_safe_mode, force_update_override_safe_mode_expires_at, force_update_delivered_count, force_update_first_delivered_at')
      .eq('id', agent.id)
      .single()
    
    // Calcular se override está válido (não expirado)
    const overrideValid = forceCheck?.force_update_override_safe_mode && 
      (!forceCheck?.force_update_override_safe_mode_expires_at || 
       new Date(forceCheck.force_update_override_safe_mode_expires_at) > new Date())

    // Se tem force_update pendente, buscar release e incluir no response
    if (forceCheck?.force_update_version) {
      // PARTE 1: Verificar se agente JÁ está na versão alvo → limpar flag
      // Normalizar versões para comparação (strip "v" prefix e sufixos como "-hotfix")
      // Version comparison via hexagonal normalizeVersion
      const currentVersion = agentVersion || updateData.agent_version
      if (normalizeVersion(currentVersion) === normalizeVersion(forceCheck.force_update_version)) {
        logger.info('Agent already at target version, clearing force_update flag', {
          agentName: agent.agent_name,
          version: currentVersion
        })
        await supabase
          .from('agents')
          .update({ 
            force_update_version: null, 
            force_update_reason: null,
            force_update_delivered_count: 0,
            force_update_first_delivered_at: null,
            force_update_override_safe_mode: false,
            force_update_override_safe_mode_expires_at: null
          })
          .eq('id', agent.id)
        
        // Response normal - agente já está atualizado
      } else {
        // PARTE 1: Verificar delivered_count - se > 50, limpar flag (agente não suporta)
        const deliveredCount = (forceCheck as any).force_update_delivered_count || 0
        
        if (deliveredCount >= 50) {
          logger.warn('Agent does not support force_update after 50 deliveries, clearing flag', {
            agentName: agent.agent_name,
            targetVersion: forceCheck.force_update_version,
            deliveredCount
          })
          await supabase
            .from('agents')
            .update({ 
              force_update_version: null, 
              force_update_reason: null,
              force_update_delivered_count: 0,
              force_update_first_delivered_at: null,
              force_update_override_safe_mode: false,
              force_update_override_safe_mode_expires_at: null
            })
            .eq('id', agent.id)
        } else {
          // Incrementar delivered_count e enviar force_update
          const now = new Date().toISOString()
          await supabase
            .from('agents')
            .update({ 
              force_update_delivered_count: deliveredCount + 1,
              force_update_first_delivered_at: (forceCheck as any).force_update_first_delivered_at || now
            })
            .eq('id', agent.id)

          logger.info('Force update detected for agent', { 
            agentName: agent.agent_name, 
            targetVersion: forceCheck.force_update_version,
            deliveryAttempt: deliveredCount + 1
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
              deliveryAttempt: deliveredCount + 1,
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
                reason: forceCheck.force_update_reason || 'Forced update via backend',
                override_safe_mode: overrideValid
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
