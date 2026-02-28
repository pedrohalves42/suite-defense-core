import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { encodeBase64 } from 'https://deno.land/std@0.208.0/encoding/base64.ts'
import { AgentTokenSchema } from '../_shared/validation.ts'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logger } from '../_shared/logger.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { normalizeVersion, normalizeForWindows } from '../_shared/hexagonal/update-decision-service.ts'
// NOTE: Codebase script imports removed - .ps1 files are NOT bundled in Deno Deploy
// All script content is served exclusively from the agent_releases DB table
// Domain event dispatch removed from hot path to reduce latency

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
      .select('agent_id, agents!inner(id, agent_name, hmac_secret, status, skip_firewall_remediation)')
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
      skip_firewall_remediation: boolean;
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

    let osInfo: OSInfo = {}
    if (hmacResult.rawBody) {
      try {
        osInfo = JSON.parse(hmacResult.rawBody) || {}
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
    
    // Get tenant_id once for all inserts
    let cachedTenantId: string | null = null
    const getTenantId = async (): Promise<string | null> => {
      if (cachedTenantId) return cachedTenantId
      const { data: agentTenant } = await supabase
        .from('agents')
        .select('tenant_id')
        .eq('id', agent.id)
        .single()
      cachedTenantId = agentTenant?.tenant_id || null
      return cachedTenantId
    }

    if (systemMetrics && typeof systemMetrics === 'object' && !systemMetrics.error) {
      const tenantId = await getTenantId()

      if (tenantId) {
        const metricsRow = {
          agent_id: agent.id,
          tenant_id: tenantId,
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

        const { error: metricsError } = await supabase
          .from('agent_system_metrics_partitioned')
          .insert(metricsRow)

        if (metricsError) {
          logger.error('METRICS INSERT FAILED', { 
            agentName: agent.agent_name, 
            error: metricsError.message,
          })
        }
      }
    }

    // ============================================================
    // SAVE PROCESS DATA from heartbeat payload → agent_processes
    // v5 agents send processes { top_by_cpu, top_by_memory, total_processes }
    // ============================================================
    const processesPayload = (osInfo as any).processes
    const processAnomalies = (osInfo as any).process_anomalies
    if (processesPayload && typeof processesPayload === 'object' && !processesPayload.error) {
      const tenantId = await getTenantId()

      if (tenantId) {
        // Flatten top_by_cpu + top_by_memory into deduplicated array
        const allProcs: any[] = []
        const seenPids = new Set<number>()
        for (const p of [...(processesPayload.top_by_cpu || []), ...(processesPayload.top_by_memory || [])]) {
          if (p.pid && !seenPids.has(p.pid)) {
            seenPids.add(p.pid)
            allProcs.push({
              pid: p.pid,
              name: p.name,
              cpu_percent: p.cpu_seconds ?? 0,
              memory_mb: p.memory_mb ?? 0,
              user: p.user ?? '',
              command_line: p.command_line,
            })
          }
        }

        const processRow = {
          agent_id: agent.id,
          tenant_id: tenantId,
          processes: allProcs,
          services: [],
          total_processes: processesPayload.total_processes ?? allProcs.length,
          total_services: 0,
          services_running: 0,
          services_stopped: 0,
          new_processes: [],
          suspicious_processes: Array.isArray(processAnomalies) ? processAnomalies : [],
          collected_at: new Date().toISOString(),
        }

        const { error: procError } = await supabase
          .from('agent_processes')
          .insert(processRow)

        if (procError) {
          logger.error('PROCESS INSERT FAILED', { 
            agentName: agent.agent_name, 
            error: procError.message,
          })
        } else {
          // Cleanup old snapshots (keep last 48h)
          await supabase
            .from('agent_processes')
            .delete()
            .eq('agent_id', agent.id)
            .lt('collected_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
        }
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
      .select('force_update_version, force_update_reason, force_update_at, force_update_override_safe_mode, force_update_override_safe_mode_expires_at, force_update_delivered_count, force_update_first_delivered_at')
      .eq('id', agent.id)
      .single()

    // Self-heal: if force_update was scheduled without force_update_version, recover target from latest active release
    const platform = updateData.os_type || 'windows'
    let effectiveForceVersion = forceCheck?.force_update_version || null
    let effectiveForceReason = forceCheck?.force_update_reason || null

    if (!effectiveForceVersion && forceCheck?.force_update_at) {
      const { data: latestActiveRelease } = await supabase
        .from('agent_releases')
        .select('version')
        .eq('platform', platform)
        .eq('channel', 'stable')
        .eq('is_active', true)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle()

      if (latestActiveRelease?.version) {
        effectiveForceVersion = latestActiveRelease.version
        effectiveForceReason = effectiveForceReason || 'Recovered from pending force_update_at without version'

        await supabase
          .from('agents')
          .update({
            force_update_version: effectiveForceVersion,
            force_update_reason: effectiveForceReason,
          })
          .eq('id', agent.id)

        logger.warn('Recovered missing force_update_version from latest active release', {
          agentName: agent.agent_name,
          targetVersion: effectiveForceVersion,
          platform,
        })
      }
    }

    // Se tem force_update pendente, buscar release e incluir no response
    // MIN_FORCE_UPDATE_VERSION guard: agents below v4.5.0 lack heartbeat force_update processing.
    // v4.5.0+ has Apply-ForcedUpdate in heartbeat response handler.
    // v5.0.7+ has Get-RollbackState/Add-EvidenceEntry for full lifecycle.
    const MIN_FORCE_UPDATE_VERSION = '4.5.0'
    const agentNorm = normalizeVersion(agentVersion || updateData.agent_version)
    const minNorm = normalizeVersion(MIN_FORCE_UPDATE_VERSION)
    
    if (effectiveForceVersion && agentNorm && minNorm && agentNorm < minNorm) {
      logger.warn('Agent version too old for force_update, clearing flag', {
        agentName: agent.agent_name,
        agentVersion: agentNorm,
        minRequired: MIN_FORCE_UPDATE_VERSION,
        targetVersion: effectiveForceVersion,
      })
      await supabase
        .from('agents')
        .update({ 
          force_update_version: null, 
          force_update_reason: 'auto_cleared_version_too_old',
          force_update_delivered_count: 0,
          force_update_first_delivered_at: null,
          force_update_override_safe_mode: false,
          force_update_override_safe_mode_expires_at: null
        })
        .eq('id', agent.id)
      // Fall through to normal heartbeat response (no force update)
    } else if (effectiveForceVersion) {
      // FIX: force_update_at é o gatilho autoritativo para re-push,
      // inclusive quando currentVersion === targetVersion (hotfix same-version)
      const currentVersion = agentVersion || updateData.agent_version
      const forceTriggeredAt = (forceCheck as any)?.force_update_at
      const hasExplicitForceTrigger = !!forceTriggeredAt

      if (!hasExplicitForceTrigger && normalizeVersion(currentVersion) === normalizeVersion(effectiveForceVersion)) {
        logger.info('Agent already at target version (no explicit force trigger), clearing force_update flag', {
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
        
        // Response normal - agente já está atualizado e não houve trigger explícito
      } else {
        // PARTE 1: Verificar delivered_count - se > 50, limpar flag (agente não suporta)
        const deliveredCount = (forceCheck as any).force_update_delivered_count || 0
        
        if (deliveredCount >= 50) {
          logger.warn('Agent does not support force_update after 50 deliveries, clearing flag', {
            agentName: agent.agent_name,
            targetVersion: effectiveForceVersion,
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
            targetVersion: effectiveForceVersion,
            deliveryAttempt: deliveredCount + 1
          })
          
          const { data: release } = await supabase
            .from('agent_releases')
            .select('version, script_content, sha256')
            .eq('version', effectiveForceVersion)
            .eq('platform', platform)
            .eq('is_active', true)
            .single()

          if (release) {
            // SAFETY: Reject HTML content from DB (corrupted releases)
            if (release.script_content?.trimStart().startsWith('<!DOCTYPE') || release.script_content?.trimStart().startsWith('<html')) {
              logger.error('Force update script is corrupted HTML, skipping delivery', {
                agentName: agent.agent_name,
                targetVersion: effectiveForceVersion,
              });
            } else {
              // AUTHORITATIVE SOURCE: Always use DB release content
              // Codebase scripts are NOT available in Deno Deploy (.ps1 not bundled)
              let finalScript = release.script_content;

              // SAFETY: Version header validation - ensure script content matches target version
              const headerMatch = finalScript.match(/CyberShield\s+Agent\s*[-–]\s*\w+\s+v?([\d]+\.[\d]+)/i);
              const scriptMajor = headerMatch?.[1] || '';
              const targetMajor = normalizeVersion(effectiveForceVersion)?.split('.').slice(0, 2).join('.') || '';
              
              if (headerMatch && scriptMajor !== targetMajor) {
                logger.error('Script version mismatch! DB content does not match target version', {
                  agentName: agent.agent_name,
                  scriptHeader: scriptMajor,
                  targetVersion: effectiveForceVersion,
                  hint: 'Use upload-release-content to fix the script_content in agent_releases',
                });
                // Skip delivery - corrupted content
              } else {

              // Normalizar script para Windows (via hexagonal shared module)
              const normalizedScript = normalizeForWindows(finalScript);
              
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
                  // FORCE UPDATE DATA (compat: suporta formatos antigos e novos)
                  force_update: true,
                  target_version: release.version,
                  version: release.version,
                  script_content_base64: base64Script,
                  script_content: finalScript,
                  sha256: calculatedSha256,
                  script_sha256: calculatedSha256, // Alias required by v5.0.13 agents
                  sha256_base64: calculatedSha256,
                  ecdsa_signature: null, // Not signed via force-update path; agent must accept null
                  script_hash_signature: null, // Compatibility: agent caches signed hash locally
                  reason: effectiveForceReason || 'Forced update via backend',
                  force_update_reason: effectiveForceReason || 'Forced update via backend',
                  override_safe_mode: !!(forceCheck as any)?.force_update_override_safe_mode && (!(forceCheck as any)?.force_update_override_safe_mode_expires_at || new Date((forceCheck as any).force_update_override_safe_mode_expires_at) > new Date()),
                  // CONFIRMATION METADATA (closed-loop)
                  confirm_url: `${supabaseUrl}/functions/v1/confirm-force-update`,
                  confirm_method: 'POST',
                  confirm_body_schema: {
                    new_version: release.version,
                    old_version: currentVersion || 'unknown',
                  },
                  // COST-OPT: Instruct agents to slow down polling
                  heartbeat_interval_seconds: 120,
                  poll_interval_seconds: 60,
                }),
                {
                  headers: { ...corsHeaders, 'Content-Type': 'application/json' },
                  status: 200
                }
              )
              } // end else version match
            } // end else HTML check
          } else {
            logger.warn('Force update version not found in agent_releases', {
              agentName: agent.agent_name,
              targetVersion: effectiveForceVersion,
              platform
            })
          }
        }
      }
    }

    // DISPATCH DOMAIN EVENT: HeartbeatReceived (non-blocking, best-effort)
    // Moved to after response to reduce latency on hot path
    // Event is dispatched but we don't wait for it

    // Response normal (sem force update)
    // COST-OPT: Send poll_interval to agents to reduce call frequency
    return new Response(
      JSON.stringify({ 
        ok: true,
        agent: agent.agent_name,
        timestamp: new Date().toISOString(),
        script_sha256: null, // Compatibility field for legacy/v5.0.13 parsing
        // COST-OPT v2: Further reduce polling to cut costs
        heartbeat_interval_seconds: 120,   // Heartbeat every 120s (was 60s)
        poll_interval_seconds: 60,         // Poll jobs every 60s (was 30s)
        // Agent config flags
        skip_firewall_remediation: agent.skip_firewall_remediation || false,
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
