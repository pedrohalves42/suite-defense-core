import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'
import { sanitizeJobOutput, sanitizeErrorMessage, sanitizeForStorage } from '../_shared/sanitize.ts'
import { verifyResultSignature, computeOutputHash } from '../_shared/verify-result-signature.ts'

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

    const hmacResult = await verifyHmacSignature(
      supabase,
      req,
      agent.agent_name,
      agent.hmac_secret,
      {
        agentId: agent.id,
        tenantId: agent.tenant_id,
        endpoint: '/submit-job-result',
        ip: ipAddress,
      }
    )
    if (!hmacResult.valid) {
      // DEBUG LOGGING: Enhanced error details
      console.error('[submit-job-result] HMAC validation failed:', {
        agent: agent.agent_name,
        error_code: hmacResult.errorCode,
        error_message: hmacResult.errorMessage,
        transient: hmacResult.transient,
        mode_used: hmacResult.modeUsed,
        headers: {
          timestamp_hmac: req.headers.get('X-HMAC-Timestamp'),
          timestamp_legacy: req.headers.get('X-Timestamp'),
          nonce_hmac: req.headers.get('X-HMAC-Nonce'),
          nonce_legacy: req.headers.get('X-Nonce'),
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
    // FASE 4: Adicionar campos para trilha de auditoria imutável
    const job_id = payload.job_id
    const status = payload.status
    const output = payload.output
    const error_message = payload.error_message
    const execution_time_seconds = payload.execution_time_seconds
    const started_at = payload.started_at
    const finished_at = payload.finished_at
    // FASE 4: Campos de auditoria
    const raw_execution_id = payload.execution_id
    const nonce = payload.nonce
    const result_signature = payload.result_signature
    const signature_algorithm = payload.signature_algorithm
    // v4.1.9: Hash chain fields
    const execution_hash = payload.execution_hash
    const previous_execution_hash = payload.previous_execution_hash
    const execution_index = payload.execution_index

    // P2.1 FIX: Normalizar execution_id - remover prefixo "exec-" se presente
    // Agentes enviam "exec-<uuid>", mas o banco usa UUID puro
    let execution_id: string | null = null
    if (raw_execution_id && typeof raw_execution_id === 'string') {
      let normalized = raw_execution_id
      if (raw_execution_id.startsWith('exec-')) {
        normalized = raw_execution_id.substring(5)
        console.log('[submit-job-result] [P2.1] Normalized execution_id from agent format:', {
          original: raw_execution_id,
          normalized
        })
      }
      // Validar formato UUID
      const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i
      if (uuidRegex.test(normalized)) {
        execution_id = normalized
      } else {
        console.warn('[submit-job-result] [P2.1] execution_id is not a valid UUID after normalization:', {
          original: raw_execution_id,
          normalized,
          job_id
        })
        // execution_id permanece null - fallback para busca por job_id
      }
    }

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

    // ============================================================
    // V-203: Require execution_id for recent jobs
    // Jobs created after transition date MUST have execution_id
    // ============================================================
    const TRANSITION_DATE = new Date('2026-01-19T00:00:00Z')
    
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
      finished_at_value: finished_at,
      // FASE 4: Auditoria
      execution_id: execution_id || 'NOT_PROVIDED',
      nonce: nonce || 'NOT_PROVIDED',
      has_signature: !!result_signature,
      // v4.1.9: Hash chain
      execution_hash: execution_hash || 'NOT_PROVIDED',
      execution_index: execution_index ?? 'NOT_PROVIDED',
      has_previous_hash: !!previous_execution_hash
    })

    // Buscar o job - CORRIGIDO: usar 'type' não 'job_type'
    // P1: Incluir payload_hash para validação de integridade
    // V-203: Incluir created_at para validação de execution_id
    const { data: job, error: fetchError } = await supabase
      .from('jobs')
      .select('id, agent_name, tenant_id, status, type, agent_id, payload_hash, created_at')
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

    // ============================================================
    // V-203: Require execution_id for jobs created after transition date
    // This ensures audit trail integrity for all new jobs
    // ============================================================
    const jobCreatedAt = new Date(job.created_at || 0)
    if (!execution_id && jobCreatedAt > TRANSITION_DATE) {
      console.error('[submit-job-result] [V-203] Missing execution_id for recent job:', {
        job_id,
        job_created_at: job.created_at,
        transition_date: TRANSITION_DATE.toISOString(),
        agent_name: agent.agent_name
      })
      
      await logSecurityEvent({
        supabase,
        tenantId: agent.tenant_id,
        ipAddress,
        endpoint: '/submit-job-result',
        attackType: 'invalid_input',  // V-203: Missing execution_id
        severity: 'high',
        blocked: true,
        details: { 
          job_id, 
          agent_name: agent.agent_name,
          job_created_at: job.created_at,
          reason: 'EXECUTION_ID_REQUIRED: Jobs created after transition require execution_id for audit trail'
        }
      })
      
      return new Response(
        JSON.stringify({ 
          error: 'EXECUTION_ID_REQUIRED',
          message: 'Jobs created after 2026-01-19 require execution_id for audit compliance'
        }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    // Comparar payload_hash do job com payload_hash da execution
    // Se diferir → ataque, bug ou corrupção
    // ============================================================
    if (execution_id && job.payload_hash) {
      const { data: execution, error: execFetchError } = await supabase
        .from('job_executions')
        .select('payload_hash')
        .eq('id', execution_id)
        .maybeSingle()
      
      if (execFetchError) {
        console.error('[submit-job-result] [P1] Error fetching execution payload_hash:', execFetchError)
      } else if (execution?.payload_hash && job.payload_hash !== execution.payload_hash) {
        console.error('[submit-job-result] [SECURITY] [P1] PAYLOAD_TAMPERED:', {
          job_id,
          execution_id,
          job_payload_hash: job.payload_hash,
          execution_payload_hash: execution.payload_hash,
          agent_name: agent.agent_name
        })
        
        await logSecurityEvent({
          supabase,
          tenantId: agent.tenant_id,
          ipAddress,
          endpoint: '/submit-job-result',
          attackType: 'payload_tampering',
          severity: 'critical',
          blocked: true,
          details: {
            job_id,
            execution_id,
            agent_name: agent.agent_name,
            job_payload_hash: job.payload_hash,
            execution_payload_hash: execution.payload_hash,
            reason: 'Job payload hash does not match execution payload hash - possible tampering or corruption'
          }
        })
        
        return new Response(
          JSON.stringify({ 
            error: 'PAYLOAD_TAMPERED',
            message: 'Job payload integrity check failed'
          }),
          { status: 409, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        )
      } else if (execution?.payload_hash) {
        console.log('[submit-job-result] [P1] Payload integrity VERIFIED:', {
          job_id,
          execution_id,
          hash_match: true
        })
      }
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
            const rawRecords = softwareList.map((sw: Record<string, unknown>) => ({
              tenant_id: agent.tenant_id,
              agent_id: job.agent_id,
              name: sanitizeForStorage(sw.name || sw.Name || sw.DisplayName || 'Unknown', 255),
              version: sanitizeForStorage(sw.version || sw.Version || sw.DisplayVersion || '', 100),
              vendor: sanitizeForStorage(sw.vendor || sw.Vendor || sw.Publisher || '', 255),
              install_location: sanitizeForStorage(sw.install_location || sw.InstallLocation || sw.InstallPath || '', 500),
              risk_level: sanitizeForStorage(sw.risk_level || sw.RiskLevel || 'unknown', 20).toLowerCase(),
              last_seen_at: new Date().toISOString()
            }))
            
            // FIX: Deduplicate records before upsert to avoid "ON CONFLICT DO UPDATE command cannot affect row a second time" error
            // Key: agent_id|name|version
            const softwareRecords = Array.from(
              new Map(rawRecords.map(r => [`${r.agent_id}|${r.name}|${r.version}`, r])).values()
            )
            
            console.log(`[submit-job-result] Deduplicated software records: ${rawRecords.length} -> ${softwareRecords.length}`)
            
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
      if (job.type === 'collect_web_activity') {
        try {
          console.log('[submit-job-result] [ZERO_TRUST] Processing web activity BEFORE marking completed...')

          const dnsCache = Array.isArray(outputData.dns_cache) ? outputData.dns_cache : []

          const rawBrowserHistory = outputData.browser_history
          const browserHistory = Array.isArray(rawBrowserHistory)
            ? rawBrowserHistory
            : Array.isArray((rawBrowserHistory as Record<string, unknown>)?.items)
              ? ((rawBrowserHistory as Record<string, unknown>).items as unknown[])
              : []

          const webActivityRaw = outputData.web_activity ?? outputData.activity ?? outputData.domains ?? []

          // Collect unique domains with metadata
          const domainMap = new Map<string, { visitCount: number; source: string; lastSeen: string }>()

          const upsertDomain = (rawDomain: unknown, source: string, visitCount = 1, visitedAt?: unknown) => {
            const domain = String(rawDomain || '').toLowerCase().trim()
            if (!domain) return

            const normalizedCount = Number(visitCount)
            const safeCount = Number.isFinite(normalizedCount) && normalizedCount > 0 ? normalizedCount : 1
            const safeVisitedAt = visitedAt ? String(visitedAt) : new Date().toISOString()

            const existing = domainMap.get(domain)
            if (existing) {
              existing.visitCount += safeCount
              existing.lastSeen = safeVisitedAt > existing.lastSeen ? safeVisitedAt : existing.lastSeen
              if (source === 'browser_history' || source === 'web_activity_v2') {
                existing.source = source
              }
            } else {
              domainMap.set(domain, {
                visitCount: safeCount,
                source,
                lastSeen: safeVisitedAt,
              })
            }
          }

          // Process DNS cache (legacy)
          for (const entry of dnsCache) {
            const rec = (entry || {}) as Record<string, unknown>
            upsertDomain(rec.domain || rec.Name || rec.RecordName, 'dns_cache', 1, rec.visited_at || rec.timestamp)
          }

          // Process browser history (legacy)
          for (const entry of browserHistory) {
            const rec = (entry || {}) as Record<string, unknown>
            let domain = rec.domain
            if (!domain && rec.url) {
              try {
                domain = new URL(String(rec.url)).hostname
              } catch {
                // ignore invalid URL
              }
            }
            upsertDomain(domain, 'browser_history', Number(rec.visit_count || rec.count || 1), rec.visited_at || rec.last_visit)
          }

          // Process web_activity v2 / aggregated payloads
          if (Array.isArray(webActivityRaw)) {
            for (const entry of webActivityRaw) {
              const rec = (entry || {}) as Record<string, unknown>
              let domain = rec.domain || rec.hostname || rec.host
              if (!domain && rec.url) {
                try {
                  domain = new URL(String(rec.url)).hostname
                } catch {
                  // ignore invalid URL
                }
              }
              upsertDomain(
                domain,
                'web_activity_v2',
                Number(rec.visit_count || rec.hits || rec.count || 1),
                rec.visited_at || rec.last_seen_at || rec.last_visit
              )
            }
          } else if (webActivityRaw && typeof webActivityRaw === 'object') {
            for (const [domain, count] of Object.entries(webActivityRaw as Record<string, unknown>)) {
              upsertDomain(domain, 'web_activity_v2', Number(count || 1), new Date().toISOString())
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
          } else {
            console.log('[submit-job-result] [ZERO_TRUST] No web activity domains found in payload')
          }
        } catch (webErr) {
          console.error('[submit-job-result] Error processing web activity:', webErr)
        }
      }

      // PROCESS ANTIVIRUS STATUS (ANTES do update)
      if (job.type === 'collect_antivirus_status' && outputData.antivirus_products) {
        try {
          console.log('[submit-job-result] [ZERO_TRUST] Processing antivirus status BEFORE marking completed...')
          const avProducts = outputData.antivirus_products as Array<Record<string, unknown>>
          
          if (Array.isArray(avProducts) && avProducts.length > 0) {
            // Helper to decode WMI SecurityCenter2 product state
            const decodeAvState = (state: number | string): { enabled: boolean; upToDate: boolean } => {
              const s = typeof state === 'string' ? parseInt(state, 10) : state
              if (isNaN(s)) return { enabled: false, upToDate: false }
              // Bits 12-15: product state (0x1000 = on)
              const enabled = ((s >> 12) & 0xF) === 1
              // Bits 4-7: definition status (0x00 = up to date)
              const upToDate = ((s >> 4) & 0xF) === 0
              return { enabled, upToDate }
            }

            // Delete old records for this agent
            const { error: deleteError } = await supabase
              .from('antivirus_status')
              .delete()
              .eq('agent_id', job.agent_id)
            
            if (deleteError) {
              console.error('[submit-job-result] Error clearing old AV status:', deleteError)
            }

            const collectedAt = outputData.collected_at
              ? new Date(String(outputData.collected_at)).toISOString()
              : new Date().toISOString()

            const avRecords = avProducts.map((av) => {
              const stateInfo = decodeAvState(av.state as number | string)
              return {
                tenant_id: agent.tenant_id,
                agent_id: job.agent_id,
                engine_name: String(av.name || av.displayName || 'Unknown'),
                engine_version: av.version ? String(av.version) : null,
                status: stateInfo.enabled ? 'active' : 'inactive',
                last_update_at: stateInfo.upToDate ? collectedAt : null,
                threats_found: 0,
                raw_data: av,
                collected_at: collectedAt,
              }
            })

            const { error: insertError } = await supabase
              .from('antivirus_status')
              .insert(avRecords)
            
            if (insertError) {
              console.error('[submit-job-result] Error inserting AV status:', insertError)
            } else {
              console.log(`[submit-job-result] [ZERO_TRUST] Inserted ${avRecords.length} AV status records`)
              sideEffectsInserted = true
              insertedRecordsCount = avRecords.length
            }
          }
        } catch (avErr) {
          console.error('[submit-job-result] Error processing antivirus status:', avErr)
        }
      }

      // PROCESS NETWORK INFO (ANTES do update)
      if (job.type === 'collect_network_info' && (outputData.adapters || outputData.ip_addresses)) {
        try {
          console.log('[submit-job-result] [ZERO_TRUST] Processing network info BEFORE marking completed...')
          
          const adapters = (outputData.adapters || []) as Array<Record<string, unknown>>
          const ipAddresses = (outputData.ip_addresses || []) as Array<Record<string, unknown>>
          const collectedAt = outputData.collected_at
            ? new Date(String(outputData.collected_at)).toISOString()
            : new Date().toISOString()

          // Build network adapters array
          const networkAdapters = adapters.map(a => ({
            name: a.Name || a.name || '',
            mac_address: a.MacAddress || a.mac_address || '',
            speed: a.LinkSpeed || a.link_speed || '',
            status: 'up',
            ip_address: '',
          }))

          // Extract gateway and DNS from IP data
          const privateIps = ipAddresses.filter((ip: any) => {
            const addr = String(ip.ip || '')
            return addr.startsWith('192.168.') || addr.startsWith('10.') || addr.startsWith('172.')
          })

          const networkRecord = {
            agent_id: job.agent_id,
            tenant_id: agent.tenant_id,
            firewall_domain: outputData.firewall_domain ?? null,
            firewall_private: outputData.firewall_private ?? null,
            firewall_public: outputData.firewall_public ?? null,
            open_ports: outputData.open_ports || [],
            active_connections: outputData.active_connections || [],
            network_adapters: networkAdapters,
            dns_servers: outputData.dns_servers || [],
            gateway_ip: outputData.gateway_ip || (privateIps.length > 0 ? String((privateIps[0] as any).ip) : null),
            public_ip: outputData.public_ip || null,
            dns_test_success: outputData.dns_test_success ?? null,
            https_test_success: outputData.https_test_success ?? null,
            collected_at: collectedAt,
          }

          const { error: insertError } = await supabase
            .from('agent_network_info')
            .insert(networkRecord)
          
          if (insertError) {
            console.error('[submit-job-result] Error inserting network info:', insertError)
          } else {
            console.log('[submit-job-result] [ZERO_TRUST] Inserted network info record')
            sideEffectsInserted = true
            insertedRecordsCount += 1
          }

          // Cleanup old records (keep last 7 days)
          await supabase
            .from('agent_network_info')
            .delete()
            .eq('agent_id', job.agent_id)
            .lt('collected_at', new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString())

        } catch (netErr) {
          console.error('[submit-job-result] Error processing network info:', netErr)
        }
      }

      // PROCESS CERTIFICATES (ANTES do update)
      if (job.type === 'collect_certificates' && (outputData.certificates || outputData.cert_store)) {
        try {
          console.log('[submit-job-result] [ZERO_TRUST] Processing certificates BEFORE marking completed...')
          const certs = (outputData.certificates || outputData.cert_store || []) as Array<Record<string, unknown>>
          
          if (Array.isArray(certs) && certs.length > 0) {
            const collectedAt = outputData.collected_at
              ? new Date(String(outputData.collected_at)).toISOString()
              : new Date().toISOString()

            // Delete old records for this agent
            await supabase
              .from('agent_certificates')
              .delete()
              .eq('agent_id', job.agent_id)

            const certRecords = certs.map((cert) => ({
              agent_id: job.agent_id,
              tenant_id: agent.tenant_id,
              subject: String(cert.subject || cert.Subject || cert.name || 'Unknown'),
              thumbprint: String(cert.thumbprint || cert.Thumbprint || cert.hash || crypto.randomUUID().replace(/-/g, '')),
              issuer: cert.issuer ? String(cert.issuer) : (cert.Issuer ? String(cert.Issuer) : null),
              valid_from: cert.valid_from || cert.NotBefore || cert.validFrom || null,
              valid_until: cert.valid_until || cert.NotAfter || cert.validTo || null,
              cert_store: String(cert.store || cert.StoreName || cert.cert_store || 'My'),
              is_self_signed: cert.is_self_signed ?? (cert.subject === cert.issuer) ?? null,
              serial_number: cert.serial_number ? String(cert.serial_number) : (cert.SerialNumber ? String(cert.SerialNumber) : null),
              key_usage: Array.isArray(cert.key_usage) ? cert.key_usage : (cert.EnhancedKeyUsageList ? [String(cert.EnhancedKeyUsageList)] : null),
              collected_at: collectedAt,
            }))

            // Deduplicate by thumbprint
            const uniqueCerts = Array.from(
              new Map(certRecords.map(r => [r.thumbprint, r])).values()
            )

            const { error: insertError } = await supabase
              .from('agent_certificates')
              .insert(uniqueCerts)
            
            if (insertError) {
              console.error('[submit-job-result] Error inserting certificates:', insertError)
            } else {
              console.log(`[submit-job-result] [ZERO_TRUST] Inserted ${uniqueCerts.length} certificate records`)
              sideEffectsInserted = true
              insertedRecordsCount += uniqueCerts.length
            }
          }
        } catch (certErr) {
          console.error('[submit-job-result] Error processing certificates:', certErr)
        }
      }

      // PROCESS DISK METRICS (ANTES do update)
      if (job.type === 'collect_disk_metrics' && (outputData.drives || outputData.disks || outputData.disk_metrics)) {
        try {
          console.log('[submit-job-result] [ZERO_TRUST] Processing disk metrics BEFORE marking completed...')
          const drives = (outputData.drives || outputData.disks || outputData.disk_metrics || []) as Array<Record<string, unknown>>
          
          if (Array.isArray(drives) && drives.length > 0) {
            const collectedAt = outputData.collected_at
              ? new Date(String(outputData.collected_at)).toISOString()
              : new Date().toISOString()

            // Delete old records for this agent
            await supabase
              .from('agent_disk_metrics')
              .delete()
              .eq('agent_id', job.agent_id)

            const diskRecords = drives.map((drive) => {
              const totalGb = Number(drive.total_gb || drive.TotalSize || drive.size || 0)
              const freeGb = Number(drive.free_gb || drive.FreeSpace || drive.free || 0)
              const usedGb = totalGb - freeGb
              const usagePercent = totalGb > 0 ? Math.round((usedGb / totalGb) * 100 * 10) / 10 : 0

              return {
                agent_id: job.agent_id,
                tenant_id: agent.tenant_id,
                drive_letter: String(drive.drive_letter || drive.DeviceID || drive.mount || drive.letter || 'C:'),
                drive_label: drive.drive_label ? String(drive.drive_label) : (drive.VolumeName ? String(drive.VolumeName) : null),
                drive_type: drive.drive_type ? String(drive.drive_type) : (drive.DriveType ? String(drive.DriveType) : null),
                total_gb: totalGb,
                used_gb: usedGb,
                free_gb: freeGb,
                usage_percent: usagePercent,
                is_system_drive: drive.is_system_drive ?? (String(drive.drive_letter || drive.DeviceID || '').toUpperCase().startsWith('C')) ?? null,
                collected_at: collectedAt,
              }
            })

            const { error: insertError } = await supabase
              .from('agent_disk_metrics')
              .insert(diskRecords)
            
            if (insertError) {
              console.error('[submit-job-result] Error inserting disk metrics:', insertError)
            } else {
              console.log(`[submit-job-result] [ZERO_TRUST] Inserted ${diskRecords.length} disk metric records`)
              sideEffectsInserted = true
              insertedRecordsCount += diskRecords.length
            }
          }
        } catch (diskErr) {
          console.error('[submit-job-result] Error processing disk metrics:', diskErr)
        }
      }
    }
    
    // ============================================================
    // FASE 4: ATUALIZAR JOB EXECUTION PRIMEIRO (trilha de auditoria imutável)
    // Depois atualizar o job principal
    // ============================================================
    
    // Calcular hash do output para verificação
    const outputString = output ? JSON.stringify(output) : null
    const outputHash = outputString 
      ? await crypto.subtle.digest('SHA-256', new TextEncoder().encode(outputString))
          .then(hash => Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join(''))
      : null
    
    // ============================================================
    // P1: VERIFICAR ASSINATURA DO RESULTADO (se fornecida)
    // Verificar ANTES de finalizar a execução
    // ============================================================
    let signatureVerified = false
    let signatureVerificationDetails: Record<string, unknown> = {}
    
    if (result_signature && execution_id && nonce) {
      console.log('[submit-job-result] [P1_SIGNATURE] Verifying result signature:', {
        job_id,
        execution_id,
        algorithm: signature_algorithm || 'ECDSA-P256-SHA256',
        signature_preview: result_signature.substring(0, 32) + '...'
      })
      
      try {
        const verifyResult = await verifyResultSignature(
          supabase,
          agent.id,
          {
            jobId: job_id,
            executionId: execution_id,
            nonce: nonce,
            outputHash: outputHash || '',
            status: status,
            // v4.1.9: Include execution_hash in signature verification
            executionHash: execution_hash || ''
          },
          result_signature,
          signature_algorithm || 'ECDSA-P256-SHA256'
        )
        
        signatureVerified = verifyResult.valid
        signatureVerificationDetails = {
          verified: verifyResult.valid,
          keyId: verifyResult.keyId,
          keyVersion: verifyResult.keyVersion,
          isCurrent: verifyResult.isCurrent,
          algorithm: verifyResult.algorithm,
          errorCode: verifyResult.errorCode,
          errorMessage: verifyResult.errorMessage
        }
        
        if (verifyResult.valid) {
          console.log('[submit-job-result] [P1_SIGNATURE] Signature VERIFIED:', {
            job_id,
            execution_id,
            keyVersion: verifyResult.keyVersion,
            isCurrent: verifyResult.isCurrent
          })
        } else {
          console.warn('[submit-job-result] [P1_SIGNATURE] Signature INVALID:', {
            job_id,
            execution_id,
            errorCode: verifyResult.errorCode,
            errorMessage: verifyResult.errorMessage
          })
          
          // Log security event for invalid signature
          await logSecurityEvent({
            supabase,
            tenantId: agent.tenant_id,
            ipAddress,
            endpoint: '/submit-job-result',
            attackType: 'invalid_input',
            severity: 'high',
            blocked: false, // Allow for now, log for monitoring
            details: {
              reason: 'invalid_result_signature',
              job_id,
              execution_id,
              agent_name: agent.agent_name,
              error_code: verifyResult.errorCode
            }
          })
        }
      } catch (sigError) {
        console.error('[submit-job-result] [P1_SIGNATURE] Verification error:', sigError)
        signatureVerificationDetails = {
          verified: false,
          error: sigError instanceof Error ? sigError.message : 'Unknown error'
        }
      }
    } else if (result_signature) {
      // Signature provided but missing execution_id or nonce
      console.warn('[submit-job-result] [P1_SIGNATURE] Signature provided but missing context:', {
        job_id,
        has_execution_id: !!execution_id,
        has_nonce: !!nonce
      })
      signatureVerificationDetails = {
        verified: false,
        error: 'Missing execution_id or nonce for signature verification'
      }
    }
    
    // Tentar finalizar a execução via RPC se execution_id foi fornecido
    let executionFinalized = false
    if (execution_id) {
      console.log('[submit-job-result] [AUDIT_TRAIL] Finalizing job execution:', {
        job_id,
        execution_id,
        status,
        has_signature: !!result_signature,
        signature_verified: signatureVerified,
        // v4.1.9: Hash chain fields
        execution_hash: execution_hash || 'NOT_PROVIDED',
        execution_index: execution_index ?? 'NOT_PROVIDED',
        has_previous_hash: !!previous_execution_hash
      })
      
      const { data: execResult, error: execError } = await supabase
        .rpc('finalize_job_execution', {
          p_job_id: job_id,
          p_execution_id: execution_id,
          p_agent_id: agent.id,
          p_status: status,
          p_started_at: started_at || null,
          p_finished_at: finished_at || new Date().toISOString(),
          p_output_hash: outputHash,
          p_error_message: error_message ? sanitizeErrorMessage(error_message) : null,
          p_execution_time_seconds: execution_time_seconds || null,
          p_result_signature: result_signature || null,
          p_signature_verified: signatureVerified,
          // v4.1.9: Hash chain fields
          p_execution_hash: execution_hash || null,
          p_previous_execution_hash: previous_execution_hash || null,
          p_execution_index: execution_index ?? null
        })
      
      if (execError) {
        console.error('[submit-job-result] [AUDIT_TRAIL] [P2.1] Error finalizing execution:', {
          error: execError.message,
          error_code: execError.code,
          error_details: execError.details,
          execution_id,
          job_id,
          agent: agent.agent_name
        })
        // Continuar mesmo se falhar - o current_execution_id será limpo no UPDATE abaixo
      } else if (execResult?.success) {
        executionFinalized = true
        console.log('[submit-job-result] [AUDIT_TRAIL] [P2.1] Execution finalized successfully:', {
          ...execResult,
          job_id,
          execution_id,
          agent: agent.agent_name,
          // v4.1.9: Hash chain confirmation
          execution_hash: execution_hash ? execution_hash.substring(0, 16) + '...' : 'NOT_PROVIDED'
        })
      } else if (execResult?.error) {
        console.warn('[submit-job-result] [AUDIT_TRAIL] [P2.1] Execution finalization failed:', {
          result: execResult,
          job_id,
          execution_id,
          agent: agent.agent_name,
          note: 'current_execution_id will still be cleared in main UPDATE'
        })
      }
    } else {
      // Backward compatibility: agentes antigos não enviam execution_id
      // Tentar buscar a execution mais recente para este job
      console.log('[submit-job-result] [AUDIT_TRAIL] No execution_id provided, attempting fallback lookup')
      
      // FIX 2026-01-19: Search for 'running' status (new RPC) OR 'claimed' (legacy)
      const { data: existingExecution } = await supabase
        .from('job_executions')
        .select('id')
        .eq('job_id', job_id)
        .eq('agent_id', agent.id)
        .in('status', ['running', 'claimed'])
        .order('claimed_at', { ascending: false })
        .limit(1)
        .maybeSingle()
      
      if (existingExecution?.id) {
        console.log('[submit-job-result] [AUDIT_TRAIL] Found existing execution for fallback:', existingExecution.id)
        
        const { data: execResult, error: execError } = await supabase
          .rpc('finalize_job_execution', {
            p_job_id: job_id,
            p_execution_id: existingExecution.id,
            p_agent_id: agent.id,
            p_status: status,
            p_started_at: started_at || null,
            p_finished_at: finished_at || new Date().toISOString(),
            p_output_hash: outputHash,
            p_error_message: error_message ? sanitizeErrorMessage(error_message) : null,
            p_execution_time_seconds: execution_time_seconds || null,
            p_result_signature: null,
            p_signature_verified: false
          })
        
        if (!execError && execResult?.success) {
          executionFinalized = true
          console.log('[submit-job-result] [AUDIT_TRAIL] Fallback execution finalized:', execResult)
        }
      } else {
        // FIX 2026-01-19: Create retroactive execution for jobs claimed before RPC fix
        console.log('[submit-job-result] [AUDIT_TRAIL] No execution found - creating retroactive execution')
        
        const retroNonce = crypto.randomUUID()
        const retroExecutionId = crypto.randomUUID()
        
        const { error: insertError } = await supabase
          .from('job_executions')
          .insert({
            id: retroExecutionId,
            job_id: job_id,
            agent_id: agent.id,
            tenant_id: agent.tenant_id,
            agent_version: agentVersion,
            agent_name: agent.agent_name,
            nonce: retroNonce,
            execution_index: 0, // Unknown chain position
            payload_hash: job.payload_hash,
            claimed_at: new Date().toISOString(),
            started_at: started_at || new Date().toISOString(),
            finished_at: finished_at || new Date().toISOString(),
            status: status,
            output_hash: outputHash,
            error_message: error_message ? sanitizeErrorMessage(error_message) : null,
            execution_time_seconds: execution_time_seconds || null
          })
        
        if (insertError) {
          console.error('[submit-job-result] [AUDIT_TRAIL] Failed to create retroactive execution:', insertError)
        } else {
          executionFinalized = true
          console.log('[submit-job-result] [AUDIT_TRAIL] Created retroactive execution:', {
            execution_id: retroExecutionId,
            job_id,
            note: 'Job was claimed before RPC fix (2026-01-19)'
          })
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
      completed_at: new Date().toISOString(),
      // P2.1 CRITICAL FIX: SEMPRE limpar current_execution_id quando job é finalizado
      // Isso garante que o job possa ser re-executado se necessário
      // E evita estados órfãos em job_executions
      current_execution_id: null
    }
    
    console.log('[submit-job-result] [P2.1_CLEANUP] Setting current_execution_id = NULL for completed job:', {
      job_id,
      status,
      executionFinalized
    })

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
    
    // FASE 4: Log se execution foi finalizada
    console.log('[submit-job-result] [AUDIT_TRAIL] Execution status before job update:', {
      job_id,
      executionFinalized,
      execution_id: execution_id || 'NOT_PROVIDED'
    })

    // GOVERNANÇA REAL: Validar enforcement de sync_blocked_websites
    if (job.type === 'sync_blocked_websites' && status === 'completed') {
      const hostsModified = Number(outputData.hosts_modified) || 0
      const blockedDomainsCount = Number(outputData.blocked_domains_count) || Number(outputData.domains_count) || 0
      const enforcementMethod = String(outputData.enforcement_method || 'none')
      const dnsFilterRunning = outputData.dns_filter_running === true
      
      console.log('[submit-job-result] [GOVERNANCE] sync_blocked_websites enforcement check:', {
        job_id,
        agent: agent.agent_name,
        blocked_domains_count: blockedDomainsCount,
        hosts_modified: hostsModified,
        enforcement_method: enforcementMethod,
        dns_filter_running: dnsFilterRunning
      })
      
      // Verificar se houve enforcement REAL
      const hasRealEnforcement = hostsModified > 0 || dnsFilterRunning
      
      if (blockedDomainsCount > 0 && !hasRealEnforcement) {
        // Domínios para bloquear mas nenhum enforcement
        updateData.status = 'completed_with_warning'
        updateData.error_message = `${blockedDomainsCount} domínios para bloquear mas enforcement_method=${enforcementMethod}. Nenhuma modificação real aplicada.`
        console.warn('[submit-job-result] [GOVERNANCE] ENFORCEMENT FALHOU: sites salvos mas nao bloqueados', {
          job_id,
          agent: agent.agent_name,
          blocked_domains_count: blockedDomainsCount,
          hosts_modified: hostsModified,
          enforcement_method: enforcementMethod
        })
      } else if (blockedDomainsCount === 0) {
        // Nenhum domínio para bloquear - isso é OK
        console.log('[submit-job-result] [GOVERNANCE] Nenhum domínio para bloquear (lista vazia ou tenant sem bloqueios configurados)')
      } else {
        // Enforcement real confirmado
        console.log('[submit-job-result] [GOVERNANCE] ENFORCEMENT CONFIRMADO:', {
          job_id,
          agent: agent.agent_name,
          enforcement_method: enforcementMethod,
          hosts_modified: hostsModified,
          dns_filter_running: dnsFilterRunning
        })
      }
      
      // Update last_block_sync_at SOMENTE se houve enforcement real
      if (hasRealEnforcement || blockedDomainsCount === 0) {
        const { error: syncUpdateError } = await supabase
          .from('agents')
          .update({ last_block_sync_at: new Date().toISOString() })
          .eq('id', agent.id)
        
        if (syncUpdateError) {
          console.error('[submit-job-result] Failed to update last_block_sync_at:', syncUpdateError)
        } else {
          console.log('[submit-job-result] Updated last_block_sync_at for agent:', agent.agent_name)
        }
      } else {
        console.warn('[submit-job-result] [GOVERNANCE] last_block_sync_at NAO atualizado - enforcement nao confirmado')
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
              
              // DEDUP: Check which domains were already recorded in last 24h for this agent
              const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
              const { data: existingAttempts } = await supabase
                .from('blocked_access_attempts')
                .select('domain')
                .eq('agent_id', job.agent_id)
                .eq('source', 'collect_web_activity')
                .gte('attempted_at', cutoff24h)
              
              const existingDomains = new Set((existingAttempts || []).map((a: { domain: string }) => a.domain))
              const newAttempts = blockedAttempts.filter(a => !existingDomains.has(a.domain))
              
              if (newAttempts.length === 0) {
                console.log(`[submit-job-result] All ${blockedAttempts.length} blocked domains already recorded in last 24h, skipping`)
              } else {
                console.log(`[submit-job-result] ${newAttempts.length} new blocked attempts (${blockedAttempts.length - newAttempts.length} deduped)`)
                
                const attemptsToInsert = newAttempts.map(attempt => ({
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
                  console.log(`[submit-job-result] Successfully recorded ${newAttempts.length} blocked access attempts`)
                }
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
            // DEDUP: Check which domains were already recorded in last 24h for this agent
            const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
            const { data: existingAttempts } = await supabase
              .from('blocked_access_attempts')
              .select('domain')
              .eq('agent_id', job.agent_id || agent.id)
              .eq('source', 'collect_dns_blocks')
              .gte('attempted_at', cutoff24h)
            
            const existingDomains = new Set((existingAttempts || []).map((a: { domain: string }) => a.domain))
            const newAttempts = attemptsToInsert.filter(a => !existingDomains.has(a.domain))
            
            if (newAttempts.length === 0) {
              console.log(`[submit-job-result] All ${attemptsToInsert.length} DNS blocked domains already recorded in last 24h, skipping`)
            } else {
              console.log(`[submit-job-result] ${newAttempts.length} new DNS blocked attempts (${attemptsToInsert.length - newAttempts.length} deduped)`)
              
              const batchSize = 100
              let insertedCount = 0
              
              for (let i = 0; i < newAttempts.length; i += batchSize) {
                const batch = newAttempts.slice(i, i + batchSize)
                
                const { error: insertError } = await supabase
                  .from('blocked_access_attempts')
                  .insert(batch)
                
                if (insertError) {
                  console.error(`[submit-job-result] Error inserting DNS blocked batch ${i}-${i + batch.length}:`, insertError)
                } else {
                  insertedCount += batch.length
                }
              }
              
              console.log(`[submit-job-result] Successfully recorded ${insertedCount}/${newAttempts.length} DNS blocked events`)
            }
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
        execution_id: execution_id || null,
        execution_finalized: executionFinalized,
        message: `Job marcado como ${status}`
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    )

  } catch (error) {
    return handleException(error, crypto.randomUUID(), 'submit-job-result')
  }
})
