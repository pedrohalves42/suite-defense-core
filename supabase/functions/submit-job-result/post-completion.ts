/**
 * Post-completion logic: governance validation, update_agent version check,
 * report trigger, blocked access analysis, DNS block events.
 */

import { logger } from '../_shared/logger.ts'
import type { SubmitContext } from './types.ts'
import { findMatchingPolicy } from './domain-matcher.ts'

/**
 * Governance: sync_blocked_websites enforcement validation.
 */
export async function validateGovernance(ctx: SubmitContext, updateData: Record<string, unknown>): Promise<void> {
  const { supabase, agent, job, payload, outputData } = ctx
  
  if (job.type !== 'sync_blocked_websites' || payload.status !== 'completed') return
  
  const hostsModified = Number(outputData.hosts_modified) || 0
  const blockedDomainsCount = Number(outputData.blocked_domains_count) || Number(outputData.domains_count) || 0
  const enforcementMethod = String(outputData.enforcement_method || 'none')
  const dnsFilterRunning = outputData.dns_filter_running === true
  
  const hasRealEnforcement = hostsModified > 0 || dnsFilterRunning
  
  if (blockedDomainsCount > 0 && !hasRealEnforcement) {
    updateData.status = 'completed'
    updateData.error_message = `[WARNING] ${blockedDomainsCount} domínios para bloquear mas enforcement_method=${enforcementMethod}. Nenhuma modificação real aplicada.`
    logger.warn('[submit-job-result] [GOVERNANCE] ENFORCEMENT FALHOU', {
      job_id: payload.job_id,
      agent: agent.agent_name,
      blocked_domains_count: blockedDomainsCount,
      hosts_modified: hostsModified
    })
  }
  
  // Update last_block_sync_at only if enforcement was real
  if (hasRealEnforcement || blockedDomainsCount === 0) {
    const { error: syncUpdateError } = await supabase
      .from('agents')
      .update({ last_block_sync_at: new Date().toISOString() })
      .eq('id', agent.id)
    
    if (syncUpdateError) {
      logger.error('[submit-job-result] Failed to update last_block_sync_at:', syncUpdateError)
    }
  }
}

/**
 * Handle empty web activity collections.
 */
export function handleEmptyWebActivity(ctx: SubmitContext, updateData: Record<string, unknown>): void {
  const { job, payload, sideEffects } = ctx
  
  if (job.type === 'collect_web_activity' && payload.status === 'completed' && !sideEffects.inserted) {
    updateData.status = 'completed'
    updateData.error_message = '[WARNING] Coleta web concluída sem histórico disponível no endpoint (sem DNS cache/browser history neste ciclo).'
    logger.warn('[submit-job-result] [WEB_ACTIVITY_EMPTY] Completed sem dados', {
      job_id: payload.job_id,
      agent: agent.agent_name
    })
  }
}

/**
 * HARDENING: update_agent version validation.
 */
export async function validateUpdateAgentVersion(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, payload } = ctx
  
  if (job.type !== 'update_agent' || payload.status !== 'completed') return
  
  let payload_data: Record<string, unknown> = {}
  if (typeof payload.output === 'object' && payload.output !== null) {
    payload_data = payload.output as Record<string, unknown>
  } else if (typeof payload.output === 'string') {
    try { payload_data = JSON.parse(payload.output) } catch { /* ignore */ }
  }
  const targetVersion = payload_data?.target_version || payload_data?.version
  
  const { data: currentAgent } = await supabase
    .from('agents')
    .select('agent_version')
    .eq('id', agent.id)
    .single()
  
  const legacyVersions = ['3.10.37', '3.10.39', '3.10.14']
  const currentVersion = currentAgent?.agent_version || ''
  const isStillLegacy = legacyVersions.some(v => currentVersion.includes(v))
  
  if (isStillLegacy && targetVersion) {
    logger.warn('[submit-job-result] HARDENING: update_agent completed but agent still on legacy', {
      job_id: payload.job_id,
      agent: agent.agent_name,
      current_version: currentVersion,
      target_version: targetVersion
    })
    
    await supabase
      .from('jobs')
      .update({
        error_message: `Update entregue mas agente ainda em ${currentVersion}. Script salvo em disco - reinício do Windows necessário.`
      })
      .eq('id', payload.job_id)
  }
}

/**
 * Trigger auto-generate-report for completed collection jobs.
 */
export async function triggerAutoReport(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, payload } = ctx
  
  const reportTriggerJobTypes = [
    'software_inventory_collect',
    'light_vuln_scan',
    'collect_antivirus_status',
    'collect_web_activity'
  ]
  
  if (payload.status !== 'completed' || !job.type || !reportTriggerJobTypes.includes(job.type)) return
  
  try {
    logger.debug('[submit-job-result] Triggering auto-generate-report for job type:', job.type)
    
    const { error: reportError } = await supabase.functions.invoke('auto-generate-report', {
      body: {
        tenant_id: agent.tenant_id,
        agent_id: job.agent_id,
        agent_name: agent.agent_name,
        job_id: payload.job_id,
        job_type: job.type,
        triggered_by: 'job_completion'
      }
    })
    
    if (reportError) {
      logger.error('[submit-job-result] Failed to trigger auto-generate-report:', reportError)
    }
  } catch (reportErr) {
    logger.error('[submit-job-result] Exception triggering auto-generate-report:', reportErr)
  }
}

/**
 * Detect blocked access attempts from web activity data.
 */
export async function analyzeBlockedAccess(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, payload, outputData } = ctx
  
  if (payload.status !== 'completed' || job.type !== 'collect_web_activity' || !payload.output) return
  
  try {
    const dnsCache = Array.isArray(outputData.dns_cache) ? outputData.dns_cache : []
    const rawBrowserHistory = outputData.browser_history
    const browserHistory = Array.isArray(rawBrowserHistory)
      ? rawBrowserHistory
      : Array.isArray((rawBrowserHistory as Record<string, unknown>)?.items)
        ? ((rawBrowserHistory as Record<string, unknown>).items as unknown[])
        : []
    const webActivityRaw = outputData.web_activity ?? outputData.activity ?? outputData.domains ?? []

    const accessedDomains = new Set<string>()
    const addDomain = (raw: unknown) => {
      const normalized = String(raw || '').toLowerCase().trim()
      if (normalized) accessedDomains.add(normalized)
    }

    for (const entry of dnsCache) {
      const rec = (entry || {}) as Record<string, unknown>
      addDomain(rec.domain || rec.Name || rec.RecordName)
    }
    for (const entry of browserHistory) {
      const rec = (entry || {}) as Record<string, unknown>
      if (rec.domain) addDomain(rec.domain)
      else if (rec.url) { try { addDomain(new URL(String(rec.url)).hostname) } catch { /* */ } }
    }
    if (Array.isArray(webActivityRaw)) {
      for (const entry of webActivityRaw) {
        const rec = (entry || {}) as Record<string, unknown>
        if (rec.domain || rec.hostname || rec.host) addDomain(rec.domain || rec.hostname || rec.host)
        else if (rec.url) { try { addDomain(new URL(String(rec.url)).hostname) } catch { /* */ } }
      }
    } else if (webActivityRaw && typeof webActivityRaw === 'object') {
      for (const domain of Object.keys(webActivityRaw as Record<string, unknown>)) addDomain(domain)
    }

    if (accessedDomains.size === 0) return

    const { data: blockedSites, error: blockedError } = await supabase
      .from('blocked_websites')
      .select('id, domain_pattern')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)
    
    if (blockedError || !blockedSites?.length) return

    const blockedAttempts: Array<{ domain: string; policy_id: string }> = []
    for (const domain of accessedDomains) {
      const policyId = findMatchingPolicy(domain, blockedSites)
      if (policyId) blockedAttempts.push({ domain, policy_id: policyId })
    }

    if (blockedAttempts.length === 0) return

    // Dedup against last 24h
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existingAttempts } = await supabase
      .from('blocked_access_attempts')
      .select('domain')
      .eq('agent_id', job.agent_id)
      .eq('source', 'collect_web_activity')
      .gte('attempted_at', cutoff24h)
    
    const existingDomains = new Set((existingAttempts || []).map((a: { domain: string }) => a.domain))
    const newAttempts = blockedAttempts.filter(a => !existingDomains.has(a.domain))
    
    if (newAttempts.length === 0) return

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
      logger.error('[submit-job-result] Error inserting blocked attempts:', insertError)
    } else {
      logger.debug(`[submit-job-result] Recorded ${newAttempts.length} blocked access attempts`)
    }
  } catch (blockedErr) {
    logger.error('[submit-job-result] Error analyzing blocked attempts:', blockedErr)
  }
}

/**
 * Process DNS filter blocked events.
 */
export async function processDnsBlockEvents(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, payload, outputData } = ctx
  
  if (payload.status !== 'completed' || job.type !== 'collect_dns_blocks' || !payload.output) return
  
  try {
    const rawBlockedEvents = outputData.blocked_events || []
    if (!Array.isArray(rawBlockedEvents) || rawBlockedEvents.length === 0) return

    const validQueryTypes = ['A', 'AAAA', 'HTTPS', 'MX', 'TXT', 'CNAME', 'PTR', 'SRV', 'NS', 'SOA']
    const blockedEvents = rawBlockedEvents.filter((event: unknown) => {
      if (!event || typeof event !== 'object') return false
      const e = event as Record<string, unknown>
      if (typeof e.domain !== 'string' || e.domain.trim().length === 0) return false
      if (e.ts !== undefined && (typeof e.ts !== 'string' || isNaN(Date.parse(e.ts)))) return false
      if (e.query_type !== undefined && !validQueryTypes.includes(String(e.query_type))) return false
      return true
    })

    // Fetch blocked policies
    const { data: blockedSites } = await supabase
      .from('blocked_websites')
      .select('id, domain_pattern')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)

    const attemptsToInsert: Array<Record<string, unknown>> = []
    for (const event of blockedEvents) {
      const domain = ((event as Record<string, unknown>).domain as string || '').toLowerCase().trim()
      if (!domain) continue
      
      const policyId = blockedSites?.length ? findMatchingPolicy(domain, blockedSites) : null
      
      attemptsToInsert.push({
        tenant_id: agent.tenant_id,
        agent_id: job.agent_id || agent.id,
        agent_name: agent.agent_name,
        domain,
        policy_id: policyId,
        attempted_at: (event as Record<string, unknown>).ts || new Date().toISOString(),
        blocked_by: 'dns',
        source: 'collect_dns_blocks'
      })
    }

    if (attemptsToInsert.length === 0) return

    // Dedup
    const cutoff24h = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString()
    const { data: existingAttempts } = await supabase
      .from('blocked_access_attempts')
      .select('domain')
      .eq('agent_id', job.agent_id || agent.id)
      .eq('source', 'collect_dns_blocks')
      .gte('attempted_at', cutoff24h)
    
    const existingDomains = new Set((existingAttempts || []).map((a: { domain: string }) => a.domain))
    const newAttempts = attemptsToInsert.filter(a => !existingDomains.has(a.domain as string))

    if (newAttempts.length === 0) return

    const batchSize = 100
    let insertedCount = 0
    for (let i = 0; i < newAttempts.length; i += batchSize) {
      const batch = newAttempts.slice(i, i + batchSize)
      const { error: insertError } = await supabase.from('blocked_access_attempts').insert(batch)
      if (insertError) {
        logger.error(`[submit-job-result] Error inserting DNS blocked batch ${i}:`, insertError)
      } else {
        insertedCount += batch.length
      }
    }
    
    logger.debug(`[submit-job-result] Recorded ${insertedCount}/${newAttempts.length} DNS blocked events`)
  } catch (dnsErr) {
    logger.error('[submit-job-result] Error processing DNS blocked events:', dnsErr)
  }
}
