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
import { applyWindowsScriptHotfix } from '../_shared/windows-script-hotfix.ts'
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
    // TUNING: Expanded join to include tenant_id + force_update fields
    // This eliminates 2 redundant DB queries later (getTenantId + forceCheck)
    const { data: token } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, hmac_secret, status, skip_firewall_remediation, agent_version, tenant_id, force_update_version, force_update_reason, force_update_at, force_update_override_safe_mode, force_update_override_safe_mode_expires_at, force_update_delivered_count, force_update_first_delivered_at, last_forced_update_applied)')
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
      agent_version: string | null;
      tenant_id: string | null;
      force_update_version: string | null;
      force_update_reason: string | null;
      force_update_at: string | null;
      force_update_override_safe_mode: boolean;
      force_update_override_safe_mode_expires_at: string | null;
      force_update_delivered_count: number;
      force_update_first_delivered_at: string | null;
      last_forced_update_applied: string | null;
    }
    
    // FASE 1.2: HMAC OBRIGATORIO - Agora hmac_secret e NOT NULL
    if (!agent.hmac_secret) {
      logger.error('CRITICAL SECURITY: Agent without HMAC secret', { agentName: agent.agent_name })
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    // V-702 FIX: HMAC enforcement for modern agents (v5.0.12+)
    // Legacy agents (pre-v5.0.12) still allowed token-only auth for backward compat
    const HMAC_REQUIRED_MIN_VERSION = '5.0.12'
    const currentAgentVersion = agent.agent_version || ''
    const currentNormV = normalizeVersion(currentAgentVersion)
    const hmacMinNormV = normalizeVersion(HMAC_REQUIRED_MIN_VERSION)
    const isModernAgent = !!(currentNormV && hmacMinNormV && currentNormV >= hmacMinNormV)
    
    const hasHmacHeaders = req.headers.get('X-HMAC-Signature') || req.headers.get('X-Timestamp') || req.headers.get('X-HMAC-Timestamp')
    
    let hmacResult: { valid: boolean; rawBody?: string; errorCode?: string; errorMessage?: string; transient?: boolean }
    
    if (hasHmacHeaders) {
      // HMAC headers present - verify
      hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
      if (!hmacResult.valid) {
        if (isModernAgent) {
          // V-702: BLOCK modern agents with invalid HMAC (no downgrade allowed)
          logger.error('SECURITY: HMAC verification FAILED for modern agent - BLOCKED', { 
            agentName: agent.agent_name, 
            agentVersion: currentAgentVersion,
            errorCode: hmacResult.errorCode,
            ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
          })
          return new Response(
            JSON.stringify({ error: 'HMAC verification failed', code: 'HMAC_INVALID' }),
            { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
          )
        }
        // Legacy agent: accept with warning (backward compat)
        logger.warn('HMAC verification failed - accepting legacy agent (token-only)', { 
          agentName: agent.agent_name, 
          agentVersion: currentAgentVersion,
          errorCode: hmacResult.errorCode,
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
        })
        let rawBody = ''
        try { rawBody = hmacResult.rawBody || '' } catch { rawBody = '' }
        hmacResult = { valid: true, rawBody }
      }
    } else {
      if (isModernAgent) {
        // V-702: BLOCK modern agents without HMAC headers entirely
        logger.error('SECURITY: Modern agent sent heartbeat WITHOUT HMAC headers - BLOCKED', { 
          agentName: agent.agent_name,
          agentVersion: currentAgentVersion,
          ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip')
        })
        return new Response(
          JSON.stringify({ error: 'HMAC headers required', code: 'HMAC_MISSING' }),
          { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }
      // Legacy agent without HMAC headers - read body manually
      let rawBody = ''
      try {
        rawBody = await req.clone().text()
      } catch { rawBody = '' }
      hmacResult = { valid: true, rawBody }
      logger.warn('Heartbeat accepted without HMAC (legacy agent)', { 
        agentName: agent.agent_name,
        agentVersion: currentAgentVersion,
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

    // Rate limiting: 1 req/min (heartbeat every 600s + generous retry margin)
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'heartbeat', {
      maxRequests: 2,
      windowMinutes: 5,
      blockMinutes: 10,
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
    
    // FASE 4: Capturar agent_version do payload (somente quando realmente mudou)
    const agentVersion = (osInfo as any).agent_version as string | undefined;
    if (agentVersion) {
      const incomingNorm = normalizeVersion(agentVersion)
      const currentNorm = normalizeVersion(agent.agent_version || undefined)
      if (!incomingNorm || !currentNorm || incomingNorm !== currentNorm) {
        updateData.agent_version = agentVersion;
      }
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
    // PERF-FIX: Parallelize independent DB operations
    // System metrics insert, process insert, and token update
    // are independent of each other — run them concurrently
    // ============================================================
    const systemMetrics = (osInfo as any).system_metrics
    
    // TUNING: tenant_id already available from initial join — zero extra queries
    const cachedTenantId = agent.tenant_id || null
    const getTenantId = async (): Promise<string | null> => cachedTenantId

    // Build all parallel promises
    const parallelOps: Promise<void>[] = []

    // 1. Token last_used_at update (fire-and-forget)
    parallelOps.push(
      supabase
        .from('agent_tokens')
        .update({ last_used_at: new Date().toISOString() })
        .eq('token_hash', tokenHash)
        .then(() => {})
    )

    // 2. System metrics insert
    if (systemMetrics && typeof systemMetrics === 'object' && !systemMetrics.error) {
      parallelOps.push((async () => {
        const tenantId = await getTenantId()
        if (!tenantId) return

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
      })())
    }

    // 3. Process data insert
    const processesPayload = (osInfo as any).processes
    const processAnomalies = (osInfo as any).process_anomalies
    if (processesPayload && typeof processesPayload === 'object' && !processesPayload.error) {
      parallelOps.push((async () => {
        const tenantId = await getTenantId()
        if (!tenantId) return

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
          // Cleanup old snapshots (keep last 48h) — non-blocking
          supabase
            .from('agent_processes')
            .delete()
            .eq('agent_id', agent.id)
            .lt('collected_at', new Date(Date.now() - 48 * 60 * 60 * 1000).toISOString())
            .then(() => {})
        }
      })())
    }

    // PERF-FIX: Execute all independent operations in parallel
    await Promise.all(parallelOps)

    // ============================================================
    // FASE VIKTOR: FORCE UPDATE VIA HEARTBEAT RESPONSE
    // Se agent tem force_update_version pendente, incluir dados completos no response
    // Isso bypassa completamente o job system e funciona com agentes antigos
    // ============================================================
    // TUNING: forceCheck data already available from initial join — zero extra queries
    const forceCheck = {
      force_update_version: agent.force_update_version,
      force_update_reason: agent.force_update_reason,
      force_update_at: agent.force_update_at,
      force_update_override_safe_mode: agent.force_update_override_safe_mode,
      force_update_override_safe_mode_expires_at: agent.force_update_override_safe_mode_expires_at,
      force_update_delivered_count: agent.force_update_delivered_count || 0,
      force_update_first_delivered_at: agent.force_update_first_delivered_at,
      last_forced_update_applied: agent.last_forced_update_applied,
    }

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
        const recoveredVersion = latestActiveRelease.version
        const currentAgentVersion = agentVersion || updateData.agent_version

        // FIX: If recovered version matches agent's current version, clear the flag instead of delivering
        if (currentAgentVersion && normalizeVersion(currentAgentVersion) === normalizeVersion(recoveredVersion)) {
          logger.warn('Self-heal recovered version matches current agent version, clearing stale force_update flag', {
            agentName: agent.agent_name,
            currentVersion: currentAgentVersion,
            recoveredVersion,
          })
          await supabase
            .from('agents')
            .update({
              force_update_version: null,
              force_update_reason: 'auto_cleared_version_matched_on_recovery',
              force_update_at: null,
              force_update_delivered_count: 0,
              force_update_first_delivered_at: null,
              force_update_override_safe_mode: false,
              force_update_override_safe_mode_expires_at: null,
            })
            .eq('id', agent.id)
          // effectiveForceVersion stays null → no force update delivered
        } else {
          effectiveForceVersion = recoveredVersion
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
      // Guard contra reentrega stale da mesma versão sem bloquear hotfix same-version
      const currentVersion = agentVersion || updateData.agent_version
      const forceTriggeredAt = (forceCheck as any)?.force_update_at
      const hasExplicitForceTrigger = !!forceTriggeredAt
      const currentNorm = normalizeVersion(currentVersion)
      const targetNorm = normalizeVersion(effectiveForceVersion)
      const lastForcedUpdateApplied = (forceCheck as any)?.last_forced_update_applied
      const forceTriggeredAtMs = forceTriggeredAt ? new Date(forceTriggeredAt).getTime() : null
      const lastAppliedMs = lastForcedUpdateApplied ? new Date(lastForcedUpdateApplied).getTime() : null
      const sameVersionAlreadyApplied = !!currentNorm && !!targetNorm && currentNorm === targetNorm
      const staleSameVersionTrigger = sameVersionAlreadyApplied && lastAppliedMs !== null && (forceTriggeredAtMs === null || forceTriggeredAtMs <= lastAppliedMs)

      if (!hasExplicitForceTrigger && sameVersionAlreadyApplied) {
        logger.info('Agent already at target version (no explicit force trigger), clearing force_update flag', {
          agentName: agent.agent_name,
          version: currentVersion
        })
        await supabase
          .from('agents')
          .update({ 
            force_update_version: null,
            force_update_reason: null,
            force_update_at: null,
            force_update_delivered_count: 0,
            force_update_first_delivered_at: null,
            force_update_override_safe_mode: false,
            force_update_override_safe_mode_expires_at: null
          })
          .eq('id', agent.id)

        // Response normal - agente já está atualizado e não houve trigger explícito
      } else if (staleSameVersionTrigger) {
        logger.warn('Stale same-version force_update detected after successful apply, clearing flag', {
          agentName: agent.agent_name,
          version: currentVersion,
          forceTriggeredAt,
          lastForcedUpdateApplied,
        })
        await supabase
          .from('agents')
          .update({
            force_update_version: null,
            force_update_reason: 'auto_cleared_already_applied',
            force_update_at: null,
            force_update_delivered_count: 0,
            force_update_first_delivered_at: null,
            force_update_override_safe_mode: false,
            force_update_override_safe_mode_expires_at: null
          })
          .eq('id', agent.id)

        // Response normal - mesmo target já foi aplicado com sucesso
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
            .select('id, version, script_content, sha256, signature_base64, signed_at')
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

              // PHASE 1 FIX: Apply runtime hotfixes to DB script before delivery
              // This ensures agents receive HOTFIX 24d/24e (skip_firewall), HOTFIX 32 (baseline dedup), etc.
              if (platform === 'windows' || platform === 'Windows') {
                try {
                  const hotfixResult = applyWindowsScriptHotfix(finalScript);
                  if (hotfixResult.changed) {
                    finalScript = hotfixResult.content;
                    logger.info('Applied runtime hotfixes to force_update script', {
                      agentName: agent.agent_name,
                      hotfixes: hotfixResult.reasons,
                      count: hotfixResult.reasons.length,
                    });
                    // Best-effort: persist hotfixed content back to agent_releases
                    const hotfixBytes = new TextEncoder().encode(finalScript);
                    const hotfixHashBuf = await crypto.subtle.digest('SHA-256', hotfixBytes);
                    const hotfixHash = Array.from(new Uint8Array(hotfixHashBuf)).map(b => b.toString(16).padStart(2, '0')).join('');
                    await supabase.from('agent_releases')
                      .update({ script_content: finalScript, sha256: hotfixHash })
                      .eq('id', release.id);
                  }
                } catch (hotfixErr) {
                  logger.warn('Hotfix injection failed (non-fatal), delivering original script', {
                    agentName: agent.agent_name,
                    error: (hotfixErr as Error).message,
                  });
                }
              }

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
                hasSignature: !!release.signature_base64,
                skipFirewallRemediation: agent.skip_firewall_remediation === true,
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
                  // CHICKEN-AND-EGG FIX: Old scripts (pre-hotfix) running on agents will try to verify
                  // Ed25519 signature, which FAILS on PowerShell 5.1. The fail-open logic (HOTFIX-14)
                  // only exists in the NEW script being downloaded. Solution: send signature as null
                  // so old scripts skip verification entirely. SHA256 integrity is already validated.
                  // Once the new script is applied, future updates will use proper signature verification.
                  ecdsa_signature: release.signature_base64 || null, // Pass real signature; null triggers fail-open on legacy agents (HOTFIX-14)
                  script_hash_signature: release.signature_base64 || null,
                  signature_base64: release.signature_base64 || null,
                  script_hash_signed_at: release.signed_at || null,
                  skip_firewall_remediation: agent.skip_firewall_remediation || false,
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
                  // COST-OPT v6: Unified intervals — BUG 5 fix: eliminates ping-pong
                  heartbeat_interval_seconds: 600,
                  poll_interval_seconds: 600,
                  // v5.0.14: Aggregation config (safe default)
                  aggregation: null,
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
        // COST-OPT v6: Unified intervals (heartbeat=600s, poll=600s) — BUG 5 fix: eliminates ping-pong
        heartbeat_interval_seconds: 600,   // Heartbeat every 10min
        poll_interval_seconds: 600,        // Poll jobs every 10min (aligned with agent-heartbeat)
        // Agent config flags
        skip_firewall_remediation: agent.skip_firewall_remediation || false,
        // v5.0.14: Aggregation config (safe default so agents don't crash on missing property)
        aggregation: null,
        // v5.0.14-fix: Always include jobs array to prevent StrictMode error in PS 5.1
        jobs: [],
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
