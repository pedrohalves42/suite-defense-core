/**
 * Side-effect: software_inventory_collect processing
 */

import { logger } from '../../_shared/logger.ts'
import { sanitizeForStorage } from '../../_shared/sanitize.ts'
import type { SubmitContext } from '../types.ts'

export async function processSoftwareInventory(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, outputData, sideEffects } = ctx
  
  if (job.type !== 'software_inventory_collect') return
  if (!outputData.software && !outputData.installed_software) return
  
  try {
    logger.debug('[submit-job-result] [ZERO_TRUST] Processing software inventory BEFORE marking completed...')
    const softwareList = outputData.software || outputData.installed_software || []
    
    if (!Array.isArray(softwareList) || softwareList.length === 0) return
    
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
    
    // Deduplicate by agent_id|name|version
    const softwareRecords = Array.from(
      new Map(rawRecords.map(r => [`${r.agent_id}|${r.name}|${r.version}`, r])).values()
    )
    
    logger.debug(`[submit-job-result] Deduplicated software records: ${rawRecords.length} -> ${softwareRecords.length}`)
    
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
        logger.error(`[submit-job-result] Error upserting software batch ${i}:`, upsertError)
      } else {
        upsertedCount += batch.length
      }
    }
    
    logger.debug(`[submit-job-result] [ZERO_TRUST] Upserted ${upsertedCount}/${softwareRecords.length} software records`)
    
    if (upsertedCount > 0) {
      sideEffects.inserted = true
      sideEffects.recordCount += upsertedCount
    }
  } catch (swErr) {
    logger.error('[submit-job-result] Error processing software inventory:', swErr)
  }
}
