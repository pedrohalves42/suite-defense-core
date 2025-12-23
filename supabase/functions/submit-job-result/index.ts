import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { sanitizeJobOutput, sanitizeErrorMessage, sanitizeForStorage } from '../_shared/sanitize.ts'

Deno.serve(async (req) => {
  // QUAL-01: Proper HTTP method validation
  if (req.method === 'OPTIONS') {
    return handleCorsPreflightRequest()
  }
  
  const methodError = validateHttpMethod(req, ['POST'])
  if (methodError) return methodError

  const supabase = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
  )

  try {
    // 1. Autenticacao via X-Agent-Token
    const agentToken = req.headers.get('X-Agent-Token')
    const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown'
    
    if (!agentToken) {
      await logSecurityEvent({
        supabase,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'medium',
        blocked: true,
        details: { reason: 'Missing X-Agent-Token' }
      })
      return new Response(
        JSON.stringify({ error: 'X-Agent-Token header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // FASE 2: Buscar agente via hash do token
    const tokenHash = await hashToken(agentToken)
    const { data: token, error: tokenError } = await supabase
      .from('agent_tokens')
      .select('agent_id, agents!inner(id, agent_name, tenant_id, hmac_secret)')
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .maybeSingle()

    if (tokenError || !token?.agents) {
      await logSecurityEvent({
        supabase,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: { token_prefix: agentToken.substring(0, 8) }
      })
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const agent = Array.isArray(token.agents) ? token.agents[0] : token.agents

    // SSA-023: Version Gate Enforcement
    // Bloquear agentes com versões muito antigas que podem ter bugs conhecidos
    // RECOVERY 2025-01-22: Relaxed from v4.1.0 to v4.0.9 to allow v4.0.10 agents
    const MIN_SUPPORTED_VERSION = 'v4.0.9'
    
    // Buscar versão do agente
    const { data: agentData } = await supabase
      .from('agents')
      .select('agent_version')
      .eq('id', agent.id)
      .single()
    
    const agentVersion = agentData?.agent_version || 'v0.0.0'
    
    // Função para comparar versões semânticas
    const compareVersions = (v1: string, v2: string): number => {
      const normalize = (v: string) => v.replace('v', '').split('.').map(Number)
      const [a, b] = [normalize(v1), normalize(v2)]
      for (let i = 0; i < 3; i++) {
        if ((a[i] || 0) !== (b[i] || 0)) return (a[i] || 0) - (b[i] || 0)
      }
      return 0
    }
    
    if (compareVersions(agentVersion, MIN_SUPPORTED_VERSION) < 0) {
      console.warn('[submit-job-result] SSA-023: Rejecting job from outdated agent', {
        agent: agent.agent_name,
        agentVersion,
        minRequired: MIN_SUPPORTED_VERSION
      })
      
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'medium',
        blocked: true,
        details: {
          reason: 'unsupported_version',
          agent_name: agent.agent_name,
          agent_version: agentVersion,
          min_required: MIN_SUPPORTED_VERSION,
          action: 'upgrade_required'
        }
      })
      
      return new Response(
        JSON.stringify({ 
          error: 'unsupported_version',
          min_required: MIN_SUPPORTED_VERSION,
          current: agentVersion,
          message: 'Agent version too old. Please update to continue submitting job results.'
        }),
        { status: 426, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 2. Verificar HMAC obrigatorio
    if (!agent.hmac_secret) {
      console.error('[submit-job-result] CRITICAL: Agent without HMAC secret:', agent.agent_name)
      return new Response(
        JSON.stringify({ error: 'HMAC secret not configured for agent' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret)
    if (!hmacResult.valid) {
      // DEBUG LOGGING: Enhanced error details
      console.error('[submit-job-result] HMAC validation failed:', {
        agent: agent.agent_name,
        error_code: hmacResult.errorCode,
        error_message: hmacResult.errorMessage,
        transient: hmacResult.transient,
        headers: {
          timestamp: req.headers.get('X-Timestamp'),
          nonce: req.headers.get('X-Nonce'),
          has_signature: !!req.headers.get('X-HMAC-Signature')
        }
      });
      
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: {
          agent_name: agent.agent_name,
          error_code: hmacResult.errorCode,
          error_message: hmacResult.errorMessage
        }
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
    
    // DEBUG LOGGING: Log successful validation
    console.log('[submit-job-result] HMAC validation SUCCESS for agent:', agent.agent_name);

    // 3. Rate limiting
    const rateLimitResult = await checkRateLimit(supabase, agent.agent_name, 'submit-job-result', {
      maxRequests: 100,
      windowMinutes: 1,
      blockMinutes: 5
    })

    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({
          error: 'Rate limit exceeded',
          resetAt: rateLimitResult.resetAt
        }),
        { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // 4. Parse payload
    const payload = await req.json()

    // ? BUG FIX P1: Extrair TODOS os campos v3, incluindo timestamps
    const job_id = payload.job_id
    const status = payload.status
    const output = payload.output
    const error_message = payload.error_message
    const execution_time_seconds = payload.execution_time_seconds
    const started_at = payload.started_at
    const finished_at = payload.finished_at

    // Validacao de schema v3
    if (!job_id || typeof job_id !== 'string') {
      return new Response(
        JSON.stringify({ error: 'Invalid payload: job_id required (string)' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validar status
    if (!status || !['completed', 'failed'].includes(status)) {
      return new Response(
        JSON.stringify({ error: 'status must be "completed" or "failed"' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ? BUG FIX P1: Validar execution_time_seconds se fornecido
    if (execution_time_seconds !== undefined && execution_time_seconds !== null) {
      if (typeof execution_time_seconds !== 'number' || execution_time_seconds < 0) {
        return new Response(
          JSON.stringify({ error: 'execution_time_seconds must be a positive number' }),
          { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      }

      // ? BUG FIX P1: Alertar se execution_time fornecido sem timestamps
      if (!started_at || !finished_at) {
        console.warn('[submit-job-result] execution_time_seconds provided without timestamps', {
          job_id,
          agent: agent.agent_name,
          execution_time_seconds,
          has_started_at: !!started_at,
          has_finished_at: !!finished_at
        })
      }
    }

    console.log('[submit-job-result] Processing job result:', {
      job_id,
      agent: agent.agent_name,
      status,
      has_output: !!output,
      output_type: output ? typeof output : 'null',
      has_error: !!error_message,
      execution_time: execution_time_seconds,
      has_started_at: !!started_at,
      has_finished_at: !!finished_at,
      started_at_value: started_at,
      finished_at_value: finished_at
    })

    // Buscar o job - CORRIGIDO: usar 'type' não 'job_type'
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, tenant_id, status, type, agent_id')
      .eq('id', job_id)
      .maybeSingle()

    if (fetchError) {
      console.error('[submit-job-result] Database error fetching job:', job_id, fetchError.message)
      return new Response(
        JSON.stringify({ error: 'Erro ao buscar job', details: fetchError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    if (!job) {
      console.error('[submit-job-result] Job not found in database:', job_id)
      return new Response(
        JSON.stringify({ error: 'Job nao encontrado' }),
        { status: 404, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }
    
    console.log('[submit-job-result] Job found:', { id: job.id, type: job.type, status: job.status })

    // Validar que o job pertence ao agente
    if (job.agent_name !== agent.agent_name) {
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'high',
        blocked: true,
        details: {
          reason: 'Job ownership mismatch',
          job_id,
          job_agent: job.agent_name,
          requesting_agent: agent.agent_name
        }
      })
      
      console.error('[submit-job-result] Job ownership mismatch:', {
        job_id,
        job_agent: job.agent_name,
        requesting_agent: agent.agent_name
      })
      return new Response(
        JSON.stringify({ error: 'Este job nao pertence ao agente autenticado' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Validacao extra: evitar acesso cross-tenant
    if (job.tenant_id !== agent.tenant_id) {
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'unauthorized',
        severity: 'critical',
        blocked: true,
        details: {
          reason: 'Cross-tenant job access attempt',
          job_tenant: job.tenant_id,
          agent_tenant: agent.tenant_id,
          job_id,
          agent_name: agent.agent_name
        }
      })
      
      console.error('[submit-job-result] Cross-tenant access blocked:', {
        job_id,
        job_tenant: job.tenant_id,
        agent_tenant: agent.tenant_id
      })
      return new Response(
        JSON.stringify({
          error: 'Cross-tenant access denied',
          details: 'Job pertence a outra organizacao'
        }),
        {
          status: 403,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' }
        }
      )
    }

    // SSA-006: Impedir que job seja processado duas vezes COM LOGGING
    if (['done', 'completed', 'failed'].includes(job.status)) {
      console.log('[submit-job-result] Job already done - duplicate submission:', job_id)
      
      // SSA-006: Log duplicate submission attempt in security_logs
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'duplicate_job_submission',
        severity: 'low',
        blocked: false,
        details: {
          job_id,
          job_status: job.status,
          agent_name: agent.agent_name,
          submitted_status: status,
          note: 'Duplicate result submission - job already completed'
        }
      })
      
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Job ja estava concluido',
          job_id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // ============================================================
    // ZERO TRUST ARCHITECTURE: INSERIR DADOS ANTES DE MARCAR COMPLETED
    // O trigger enforce_job_side_effects bloqueia completed sem side effects
    // ============================================================
    
    // Parse output PRIMEIRO (antes de qualquer update)
    let outputData: Record<string, unknown> = {}
    if (output) {
      if (typeof output === 'object' && output !== null) {
        outputData = output as Record<string, unknown>
      } else if (typeof output === 'string') {
        try {
          const parsed = JSON.parse(output)
          if (typeof parsed === 'object' && parsed !== null) {
            outputData = parsed as Record<string, unknown>
          }
        } catch (parseErr) {
          console.warn('[submit-job-result] Failed to parse output as JSON string:', {
            job_id: job.id,
            output_preview: String(output).substring(0, 200),
            error: parseErr instanceof Error ? parseErr.message : 'Unknown error'
          })
        }
      }
    }
    
    // Flag para rastrear se side effects foram inseridos
    let sideEffectsInserted = false
    let insertedRecordsCount = 0
    
    // ============================================================
    // PROCESS SIDE EFFECTS ANTES DE MARCAR COMPLETED
    // ============================================================
    if (status === 'completed') {
      
      // PROCESS SOFTWARE INVENTORY (ANTES do update)
      if (job.type === 'software_inventory_collect' && (outputData.software || outputData.installed_software)) {
        try {
          console.log('[submit-job-result] [ZERO_TRUST] Processing software inventory BEFORE marking completed...')
          const softwareList = outputData.software || outputData.installed_software || []
          
          if (Array.isArray(softwareList) && softwareList.length > 0) {
            // Prepare records for UPSERT - SSA-007: Sanitizar campos de texto
            const softwareRecords = softwareList.map((sw: Record<string, unknown>) => ({
              tenant_id: agent.tenant_id,
              agent_id: job.agent_id,
              name: sanitizeForStorage(sw.name || sw.Name || sw.DisplayName || 'Unknown', 255),
              version: sanitizeForStorage(sw.version || sw.Version || sw.DisplayVersion || '', 100),
              vendor: sanitizeForStorage(sw.vendor || sw.Vendor || sw.Publisher || '', 255),
              install_location: sanitizeForStorage(sw.install_location || sw.InstallLocation || sw.InstallPath || '', 500),
              risk_level: sanitizeForStorage(sw.risk_level || sw.RiskLevel || 'unknown', 20).toLowerCase(),
              last_seen_at: new Date().toISOString()
            }))
            
            // UPSERT em batches - evita race condition e duplicate key errors
            const batchSize = 100
            let upsertedCount = 0
            for (let i = 0; i < softwareRecords.length; i += batchSize) {
              const batch = softwareRecords.slice(i, i + batchSize)
              const { error: upsertError } = await supabase
                .from('software_inventory')
                .upsert(batch, { 
                  onConflict: 'agent_id,name,version',
                  ignoreDuplicates: false 
                })
              
              if (upsertError) {
                console.error(`[submit-job-result] Error upserting software batch ${i}:`, upsertError)
              } else {
                upsertedCount += batch.length
              }
            }
            
            console.log(`[submit-job-result] [ZERO_TRUST] Upserted ${upsertedCount}/${softwareRecords.length} software records`)
            
            if (upsertedCount > 0) {
              sideEffectsInserted = true
              insertedRecordsCount = upsertedCount
            }
          }
        } catch (swErr) {
          console.error('[submit-job-result] Error processing software inventory:', swErr)
        }
      }
      
      // PROCESS WEB ACTIVITY (ANTES do update)
      if (job.type === 'collect_web_activity' && (outputData.dns_cache || outputData.browser_history)) {
        try {
          console.log('[submit-job-result] [ZERO_TRUST] Processing web activity BEFORE marking completed...')
          
          const dnsCache = outputData.dns_cache || []
          const browserHistory = outputData.browser_history || []
          
          // Collect unique domains with metadata
          const domainMap = new Map<string, { visitCount: number; source: string; lastSeen: string }>()
          
          // Process DNS cache
          if (Array.isArray(dnsCache)) {
            for (const entry of dnsCache) {
              const domain = String(entry.domain || entry.Name || entry.RecordName || '').toLowerCase().trim()
              if (domain && domain.length > 0) {
                const existing = domainMap.get(domain)
                if (existing) {
                  existing.visitCount++
                } else {
                  domainMap.set(domain, { visitCount: 1, source: 'dns_cache', lastSeen: new Date().toISOString() })
                }
              }
            }
          }
          
          // Process browser history
          if (Array.isArray(browserHistory)) {
            for (const entry of browserHistory) {
              let domain = entry.domain
              if (!domain && entry.url) {
                try {
                  domain = new URL(entry.url).hostname
                } catch { /* ignore */ }
              }
              if (domain) {
                domain = domain.toLowerCase().trim()
                const existing = domainMap.get(domain)
                if (existing) {
                  existing.visitCount++
                  existing.source = 'browser_history'
                } else {
                  domainMap.set(domain, { visitCount: 1, source: 'browser_history', lastSeen: new Date().toISOString() })
                }
              }
            }
          }
          
          if (domainMap.size > 0) {
            // Fetch blocked websites to mark is_blocked
            const { data: blockedSites } = await supabase
              .from('blocked_websites')
              .select('domain_pattern')
              .eq('tenant_id', agent.tenant_id)
              .eq('is_active', true)
            
            const blockedPatterns = (blockedSites || []).map(s => s.domain_pattern.toLowerCase())
            
            // Prepare records
            const activityRecords = Array.from(domainMap.entries()).map(([domain, data]) => {
              // Check if domain is blocked
              let isBlocked = false
              for (const pattern of blockedPatterns) {
                if (pattern.startsWith('*.')) {
                  const base = pattern.slice(2)
                  if (domain === base || domain.endsWith('.' + base)) {
                    isBlocked = true
                    break
                  }
                } else if (domain === pattern || domain.endsWith('.' + pattern)) {
                  isBlocked = true
                  break
                }
              }
              
              return {
                tenant_id: agent.tenant_id,
                agent_id: job.agent_id,
                domain,
                source: data.source,
                visit_count: data.visitCount,
                visited_at: data.lastSeen,
                is_blocked: isBlocked
              }
            })
            
            // Batch insert
            const batchSize = 100
            let insertedCount = 0
            for (let i = 0; i < activityRecords.length; i += batchSize) {
              const batch = activityRecords.slice(i, i + batchSize)
              const { error: insertError } = await supabase
                .from('agent_web_activity')
                .insert(batch)
              
              if (insertError) {
                console.error(`[submit-job-result] Error inserting web activity batch ${i}:`, insertError)
              } else {
                insertedCount += batch.length
              }
            }
            
            console.log(`[submit-job-result] [ZERO_TRUST] Inserted ${insertedCount}/${activityRecords.length} web activity records`)
            
            if (insertedCount > 0) {
              sideEffectsInserted = true
              insertedRecordsCount = insertedCount
            }
          }
        } catch (webErr) {
          console.error('[submit-job-result] Error processing web activity:', webErr)
        }
      }
    }
    
    // ============================================================
    // AGORA ATUALIZAR O JOB (após side effects inseridos)
    // O trigger enforce_job_side_effects validará a integridade
    // ============================================================
    const updateData: Record<string, unknown> = {
      status: status,
      finished_at: finished_at || new Date().toISOString(),
      completed_at: new Date().toISOString()
    }

    if (started_at) {
      updateData.started_at = started_at
    }
    // SSA-007: Sanitizar output antes de gravar
    if (output !== undefined) {
      updateData.output = sanitizeJobOutput(output)
    }
    // SSA-007: Sanitizar error_message
    if (error_message) {
      updateData.error_message = sanitizeErrorMessage(error_message)
    }
    if (execution_time_seconds !== undefined) {
      updateData.execution_time_seconds = execution_time_seconds
    }

    // GOVERNANÇA: Validar contrato de sucesso para sync_blocked_websites
    if (job.type === 'sync_blocked_websites' && status === 'completed' && output) {
      const applyToHosts = outputData.apply_to_hosts === true
      const hostsModified = Number(outputData.hosts_modified) || 0
      const blockedDomainsCount = Number(outputData.blocked_domains_count) || 0
      
      if (applyToHosts && hostsModified === 0 && blockedDomainsCount > 0) {
        updateData.status = 'completed_with_warning'
        updateData.error_message = `Bloqueio solicitado mas hosts_modified=0. ${blockedDomainsCount} domínios não foram aplicados ao arquivo hosts.`
        console.warn('[submit-job-result] GOVERNANCE WARNING: sync_blocked_websites completed but hosts not modified', {
          job_id,
          agent: agent.agent_name,
          blocked_domains_count: blockedDomainsCount,
          hosts_modified: hostsModified
        })
      }
    }

    console.log('[submit-job-result] [ZERO_TRUST] Updating job with data:', {
      job_id,
      status: updateData.status,
      sideEffectsInserted,
      insertedRecordsCount,
      updateFields: Object.keys(updateData)
    })

    const { data: updateResult, error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job_id)
      .select()

    if (updateError) {
      // ZERO TRUST: Se o erro for JOB_INTEGRITY_VIOLATION, logar claramente
      const isIntegrityViolation = updateError.message?.includes('JOB_INTEGRITY_VIOLATION')
      
      console.error('[submit-job-result] Database update failed:', {
        job_id,
        error: updateError.message,
        error_code: updateError.code,
        isIntegrityViolation,
        sideEffectsInserted,
        insertedRecordsCount
      })
      
      if (isIntegrityViolation) {
        console.error('[submit-job-result] [ZERO_TRUST_BLOCKED] Trigger blocked completed without side effects!', {
          job_id,
          job_type: job.type,
          agent: agent.agent_name
        })
      }
      
      return new Response(
        JSON.stringify({ 
          error: isIntegrityViolation ? 'Job integrity violation: missing side effects' : 'Erro ao atualizar job', 
          details: updateError.message,
          code: isIntegrityViolation ? 'INTEGRITY_VIOLATION' : updateError.code
        }),
        { status: isIntegrityViolation ? 422 : 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // [JOB_INTEGRITY_OK] - Log explícito de sucesso (prova de vida)
    if (status === 'completed') {
      console.info('[JOB_INTEGRITY_OK]', {
        job_id: job.id,
        type: job.type,
        agent_id: job.agent_id,
        agent_name: agent.agent_name,
        sideEffectsInserted,
        insertedRecordsCount
      })
    }

    console.log('[submit-job-result] Job updated successfully:', {
      job_id,
      agent: agent.agent_name,
      final_status: status,
      rows_affected: updateResult?.length || 0
    })

    // ============================================================
    // HARDENING: Validação de versão após update_agent
    // Se o job é update_agent e o agente ainda está em versão legada,
    // o update não foi aplicado de fato - registrar warning
    // ============================================================
    if (job.type === 'update_agent' && status === 'completed') {
      // Parse output if string
      let payload_data: Record<string, unknown> = {}
      if (typeof output === 'object' && output !== null) {
        payload_data = output as Record<string, unknown>
      } else if (typeof output === 'string') {
        try { payload_data = JSON.parse(output) } catch { /* ignore */ }
      }
      const targetVersion = payload_data?.target_version || payload_data?.version
      
      // Buscar versão atual do agente para verificar se update realmente funcionou
      const { data: currentAgent } = await supabase
        .from('agents')
        .select('agent_version')
        .eq('id', agent.id)
        .single()
      
      const legacyVersions = ['3.10.37', '3.10.39', '3.10.14']
      const currentVersion = currentAgent?.agent_version || ''
      const isStillLegacy = legacyVersions.some(v => currentVersion.includes(v))
      
      if (isStillLegacy && targetVersion) {
        console.warn('[submit-job-result] HARDENING WARNING: update_agent completed but agent still on legacy version', {
          job_id,
          agent: agent.agent_name,
          current_version: currentVersion,
          target_version: targetVersion,
          note: 'Update saved to disk but requires Windows reboot to apply'
        })
        
        // Adicionar warning ao job sem mudar status
        await supabase
          .from('jobs')
          .update({
            error_message: `Update entregue mas agente ainda em ${currentVersion}. Script salvo em disco - reinício do Windows necessário.`
          })
          .eq('id', job_id)
      }
    }

    // NOTE: Software inventory e web activity já processados ANTES do update (Zero Trust)
    // O código abaixo foi movido para antes do UPDATE para garantir integridade

    // Trigger automatic report generation for security collection jobs - CORRIGIDO: usar job.type
    const reportTriggerJobTypes = [
      'software_inventory_collect',
      'light_vuln_scan',
      'collect_antivirus_status',
      'collect_web_activity'
    ]
    
    if (status === 'completed' && job.type && reportTriggerJobTypes.includes(job.type)) {
      try {
        console.log('[submit-job-result] Triggering auto-generate-report for job type:', job.type)
        
        const { error: reportError } = await supabase.functions.invoke('auto-generate-report', {
          body: {
            tenant_id: agent.tenant_id,
            agent_id: job.agent_id,
            agent_name: agent.agent_name,
            job_id: job_id,
            job_type: job.type,
            triggered_by: 'job_completion'
          }
        })
        
        if (reportError) {
          console.error('[submit-job-result] Failed to trigger auto-generate-report:', reportError)
        } else {
          console.log('[submit-job-result] Auto-generate-report triggered successfully')
        }
      } catch (reportErr) {
        console.error('[submit-job-result] Exception triggering auto-generate-report:', reportErr)
      }
    }

    // FASE 3 - EVIDÊNCIA AUDITÁVEL: Detectar tentativas de acesso a sites bloqueados via DNS cache
    if (status === 'completed' && job.type === 'collect_web_activity' && output) {
      try {
        console.log('[submit-job-result] Analyzing web activity for blocked access attempts...')
        
        // Extrair domínios do DNS cache e browser history
        const outputData = typeof output === 'object' ? output : {}
        const dnsCache = outputData.dns_cache || []
        const browserHistory = outputData.browser_history || []
        
        // Coletar todos os domínios acessados
        const accessedDomains = new Set<string>()
        
        // De DNS cache
        if (Array.isArray(dnsCache)) {
          for (const entry of dnsCache) {
            if (entry.domain || entry.Name || entry.RecordName) {
              const domain = (entry.domain || entry.Name || entry.RecordName || '').toLowerCase().trim()
              if (domain && domain.length > 0) {
                accessedDomains.add(domain)
              }
            }
          }
        }
        
        // De browser history
        if (Array.isArray(browserHistory)) {
          for (const entry of browserHistory) {
            if (entry.domain || entry.url) {
              let domain = entry.domain
              if (!domain && entry.url) {
                try {
                  const url = new URL(entry.url)
                  domain = url.hostname
                } catch { /* ignore invalid URLs */ }
              }
              if (domain) {
                accessedDomains.add(domain.toLowerCase().trim())
              }
            }
          }
        }
        
        if (accessedDomains.size === 0) {
          console.log('[submit-job-result] No domains found in web activity data')
        } else {
          console.log(`[submit-job-result] Found ${accessedDomains.size} unique domains to check against blocked list`)
          
          // Buscar lista de sites bloqueados do tenant
          const { data: blockedSites, error: blockedError } = await supabase
            .from('blocked_websites')
            .select('id, domain_pattern')
            .eq('tenant_id', agent.tenant_id)
            .eq('is_active', true)
          
          if (blockedError) {
            console.error('[submit-job-result] Error fetching blocked websites:', blockedError)
          } else if (blockedSites && blockedSites.length > 0) {
            console.log(`[submit-job-result] Checking against ${blockedSites.length} blocked patterns`)
            
            const blockedAttempts: Array<{
              domain: string
              policy_id: string
            }> = []
            
            // Verificar cada domínio acessado contra padrões bloqueados
            for (const domain of accessedDomains) {
              for (const site of blockedSites) {
                const pattern = site.domain_pattern.toLowerCase()
                let matches = false
                
                // Suporte a wildcards (*.example.com)
                if (pattern.startsWith('*.')) {
                  const baseDomain = pattern.slice(2)
                  matches = domain === baseDomain || domain.endsWith('.' + baseDomain)
                } else {
                  // Match exato ou subdomínio
                  matches = domain === pattern || domain.endsWith('.' + pattern)
                }
                
                if (matches) {
                  blockedAttempts.push({
                    domain,
                    policy_id: site.id
                  })
                  break // Evitar duplicatas para o mesmo domínio
                }
              }
            }
            
            if (blockedAttempts.length > 0) {
              console.log(`[submit-job-result] Found ${blockedAttempts.length} blocked access attempts`)
              
              // Inserir tentativas bloqueadas
              const attemptsToInsert = blockedAttempts.map(attempt => ({
                tenant_id: agent.tenant_id,
                agent_id: job.agent_id,
                agent_name: agent.agent_name,
                domain: attempt.domain,
                policy_id: attempt.policy_id,
                attempted_at: new Date().toISOString(),
                blocked_by: 'dns_monitoring',
                source: 'collect_web_activity'
              }))
              
              const { error: insertError } = await supabase
                .from('blocked_access_attempts')
                .insert(attemptsToInsert)
              
              if (insertError) {
                console.error('[submit-job-result] Error inserting blocked attempts:', insertError)
              } else {
                console.log(`[submit-job-result] Successfully recorded ${blockedAttempts.length} blocked access attempts`)
              }
            } else {
              console.log('[submit-job-result] No blocked access attempts detected')
            }
          }
        }
      } catch (blockedErr) {
        console.error('[submit-job-result] Error analyzing blocked attempts:', blockedErr)
      }
    }

    // FASE 4 - DNS LOCAL: Processar eventos de bloqueio do DNS Filter local
    if (status === 'completed' && job.type === 'collect_dns_blocks' && output) {
      try {
        console.log('[submit-job-result] Processing DNS filter blocked events...')
        
        const outputData = typeof output === 'object' ? output : {}
        const rawBlockedEvents = outputData.blocked_events || []
        
        if (!Array.isArray(rawBlockedEvents) || rawBlockedEvents.length === 0) {
          console.log('[submit-job-result] No DNS blocked events to process')
        } else {
          console.log(`[submit-job-result] Processing ${rawBlockedEvents.length} DNS blocked events`)
          
          // P1 QUAL-01: Validação Zod para eventos DNS bloqueados
          const validQueryTypes = ['A', 'AAAA', 'HTTPS', 'MX', 'TXT', 'CNAME', 'PTR', 'SRV', 'NS', 'SOA']
          const blockedEvents = rawBlockedEvents.filter((event: unknown) => {
            if (!event || typeof event !== 'object') {
              console.warn('[submit-job-result] Invalid blocked event (not an object):', event)
              return false
            }
            const e = event as Record<string, unknown>
            
            // domain é obrigatório e deve ser string não vazia
            if (typeof e.domain !== 'string' || e.domain.trim().length === 0) {
              console.warn('[submit-job-result] Invalid blocked event (missing/empty domain):', e)
              return false
            }
            
            // ts deve ser string ISO se presente
            if (e.ts !== undefined && (typeof e.ts !== 'string' || isNaN(Date.parse(e.ts)))) {
              console.warn('[submit-job-result] Invalid blocked event (invalid ts):', e)
              return false
            }
            
            // query_type deve estar na lista permitida se presente
            if (e.query_type !== undefined && !validQueryTypes.includes(String(e.query_type))) {
              console.warn('[submit-job-result] Invalid blocked event (unknown query_type):', e)
              return false
            }
            
            return true
          })
          
          console.log(`[submit-job-result] Validated ${blockedEvents.length}/${rawBlockedEvents.length} DNS blocked events`)
          
          // Buscar políticas ativas para correlação
          const { data: blockedSites, error: sitesError } = await supabase
            .from('blocked_websites')
            .select('id, domain_pattern')
            .eq('tenant_id', agent.tenant_id)
            .eq('is_active', true)
          
          if (sitesError) {
            console.error('[submit-job-result] Error fetching blocked websites for DNS correlation:', sitesError)
          }
          
          const attemptsToInsert: Array<{
            tenant_id: string
            agent_id: string
            agent_name: string
            domain: string
            policy_id: string | null
            attempted_at: string
            blocked_by: string
            source: string
          }> = []
          
          for (const event of blockedEvents) {
            const domain = (event.domain || '').toLowerCase().trim()
            if (!domain) continue
            
            // Correlacionar com política
            let policyId: string | null = null
            if (blockedSites && blockedSites.length > 0) {
              for (const site of blockedSites) {
                const pattern = site.domain_pattern.toLowerCase()
                let matches = false
                
                if (pattern.startsWith('*.')) {
                  const baseDomain = pattern.slice(2)
                  matches = domain === baseDomain || domain.endsWith('.' + baseDomain)
                } else {
                  matches = domain === pattern || domain.endsWith('.' + pattern)
                }
                
                if (matches) {
                  policyId = site.id
                  break
                }
              }
            }
            
            attemptsToInsert.push({
              tenant_id: agent.tenant_id,
              agent_id: job.agent_id || agent.id,
              agent_name: agent.agent_name,
              domain: domain,
              policy_id: policyId,
              attempted_at: event.ts || new Date().toISOString(),
              blocked_by: 'dns',
              source: 'collect_dns_blocks'
            })
          }
          
          if (attemptsToInsert.length > 0) {
            // Batch insert de 100 registros
            const batchSize = 100
            let insertedCount = 0
            
            for (let i = 0; i < attemptsToInsert.length; i += batchSize) {
              const batch = attemptsToInsert.slice(i, i + batchSize)
              
              const { error: insertError } = await supabase
                .from('blocked_access_attempts')
                .insert(batch)
              
              if (insertError) {
                console.error(`[submit-job-result] Error inserting DNS blocked batch ${i}-${i + batch.length}:`, insertError)
              } else {
                insertedCount += batch.length
              }
            }
            
            console.log(`[submit-job-result] Successfully recorded ${insertedCount}/${attemptsToInsert.length} DNS blocked events`)
          }
        }
      } catch (dnsErr) {
        console.error('[submit-job-result] Error processing DNS blocked events:', dnsErr)
      }
    }

    return new Response(
      JSON.stringify({ 
        success: true,
        job_id,
        message: `Job marcado como ${status}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'submit-job-result')
  }
})
