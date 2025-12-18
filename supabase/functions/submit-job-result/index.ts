import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { handleException, corsHeaders } from '../_shared/error-handler.ts'
import { verifyHmacSignature } from '../_shared/hmac.ts'
import { checkRateLimit } from '../_shared/rate-limit.ts'
import { logSecurityEvent } from '../_shared/security-log.ts'
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts'
import { hashToken } from '../_shared/token-hash.ts'

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

    // Impedir que job seja processado duas vezes
    if (['done', 'completed', 'failed'].includes(job.status)) {
      console.log('[submit-job-result] Job already done:', job_id)
      return new Response(
        JSON.stringify({ 
          success: true,
          message: 'Job ja estava concluido',
          job_id
        }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

     // ? BUG FIX P1: Atualizar o job com TODOS os campos v3, incluindo timestamps
    const updateData: Record<string, unknown> = {
      status: status,
      finished_at: finished_at || new Date().toISOString(),
      completed_at: new Date().toISOString() // Compatibilidade legado
    }

    // ? BUG FIX P1: Incluir started_at explicitamente
    if (started_at) {
      updateData.started_at = started_at
    }

    // Adicionar campos extras se existirem
    if (output !== undefined) {
      updateData.output = output
    }
    if (error_message) {
      updateData.error_message = error_message
    }
    if (execution_time_seconds !== undefined) {
      updateData.execution_time_seconds = execution_time_seconds
    }

    // GOVERNANÇA: Validar contrato de sucesso para sync_blocked_websites
    if (job.type === 'sync_blocked_websites' && status === 'completed' && output) {
      const outputData = typeof output === 'object' ? output : {}
      const applyToHosts = outputData.apply_to_hosts === true
      const hostsModified = outputData.hosts_modified || 0
      const blockedDomainsCount = outputData.blocked_domains_count || 0
      
      // Se apply_to_hosts foi solicitado mas nenhum host foi modificado = warning
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

    console.log('[submit-job-result] Updating job with data:', {
      job_id,
      updateData: JSON.stringify(updateData, null, 2),
      updateFields: Object.keys(updateData)
    })

    const { data: updateResult, error: updateError } = await supabase
      .from('jobs')
      .update(updateData)
      .eq('id', job_id)
      .select()

    if (updateError) {
      console.error('[submit-job-result] Database update failed:', {
        job_id,
        error: updateError.message,
        error_code: updateError.code,
        error_details: updateError.details,
        error_hint: updateError.hint
      })
      return new Response(
        JSON.stringify({ error: 'Erro ao atualizar job', details: updateError.message }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      )
    }

    console.log('[submit-job-result] Job updated successfully:', {
      job_id,
      agent: agent.agent_name,
      final_status: status,
      updated_record: updateResult ? JSON.stringify(updateResult[0]) : 'null',
      rows_affected: updateResult?.length || 0
    })

    // ============================================================
    // HARDENING: Validação de versão após update_agent
    // Se o job é update_agent e o agente ainda está em versão legada,
    // o update não foi aplicado de fato - registrar warning
    // ============================================================
    if (job.type === 'update_agent' && status === 'completed') {
      const payload_data = typeof output === 'object' ? output : {}
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
