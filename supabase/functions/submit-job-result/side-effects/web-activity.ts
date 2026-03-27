/**
 * Side-effect: collect_web_activity processing
 */

import { logger } from '../../_shared/logger.ts'
import type { SubmitContext } from '../types.ts'
import { matchDomainAgainstPatterns } from '../domain-matcher.ts'

export async function processWebActivity(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, outputData, sideEffects } = ctx
  
  if (job.type !== 'collect_web_activity') return
  
  try {
    logger.debug('[submit-job-result] [ZERO_TRUST] Processing web activity BEFORE marking completed...')

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
        domainMap.set(domain, { visitCount: safeCount, source, lastSeen: safeVisitedAt })
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
        try { domain = new URL(String(rec.url)).hostname } catch { /* ignore */ }
      }
      upsertDomain(domain, 'browser_history', Number(rec.visit_count || rec.count || 1), rec.visited_at || rec.last_visit)
    }

    // Process web_activity v2
    if (Array.isArray(webActivityRaw)) {
      for (const entry of webActivityRaw) {
        const rec = (entry || {}) as Record<string, unknown>
        let domain = rec.domain || rec.hostname || rec.host
        if (!domain && rec.url) {
          try { domain = new URL(String(rec.url)).hostname } catch { /* ignore */ }
        }
        upsertDomain(domain, 'web_activity_v2', Number(rec.visit_count || rec.hits || rec.count || 1), rec.visited_at || rec.last_seen_at || rec.last_visit)
      }
    } else if (webActivityRaw && typeof webActivityRaw === 'object') {
      for (const [domain, count] of Object.entries(webActivityRaw as Record<string, unknown>)) {
        upsertDomain(domain, 'web_activity_v2', Number(count || 1), new Date().toISOString())
      }
    }

    if (domainMap.size === 0) {
      logger.debug('[submit-job-result] [ZERO_TRUST] No web activity domains found in payload')
      return
    }

    // Fetch blocked patterns
    const { data: blockedSites } = await supabase
      .from('blocked_websites')
      .select('domain_pattern')
      .eq('tenant_id', agent.tenant_id)
      .eq('is_active', true)

    const blockedPatterns = (blockedSites || []).map((s: { domain_pattern: string }) => s.domain_pattern.toLowerCase())

    const activityRecords = Array.from(domainMap.entries()).map(([domain, data]) => ({
      tenant_id: agent.tenant_id,
      agent_id: job.agent_id,
      domain,
      source: data.source,
      visit_count: data.visitCount,
      visited_at: data.lastSeen,
      is_blocked: matchDomainAgainstPatterns(domain, blockedPatterns)
    }))

    // Batch insert
    const batchSize = 100
    let insertedCount = 0
    for (let i = 0; i < activityRecords.length; i += batchSize) {
      const batch = activityRecords.slice(i, i + batchSize)
      const { error: insertError } = await supabase.from('agent_web_activity').insert(batch)
      if (insertError) {
        logger.error(`[submit-job-result] Error inserting web activity batch ${i}:`, insertError)
      } else {
        insertedCount += batch.length
      }
    }

    logger.debug(`[submit-job-result] [ZERO_TRUST] Inserted ${insertedCount}/${activityRecords.length} web activity records`)

    if (insertedCount > 0) {
      sideEffects.inserted = true
      sideEffects.recordCount += insertedCount
    }
  } catch (webErr) {
    logger.error('[submit-job-result] Error processing web activity:', webErr)
  }
}
