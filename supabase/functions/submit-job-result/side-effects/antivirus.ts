/**
 * Side-effect: collect_antivirus_status processing
 */

import { logger } from '../../_shared/logger.ts'
import type { SubmitContext } from '../types.ts'

export async function processAntivirusStatus(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, outputData, sideEffects } = ctx
  
  if (job.type !== 'collect_antivirus_status' || !outputData.antivirus_products) return
  
  try {
    logger.debug('[submit-job-result] [ZERO_TRUST] Processing antivirus status BEFORE marking completed...')
    const avProducts = outputData.antivirus_products as Array<Record<string, unknown>>
    
    if (!Array.isArray(avProducts) || avProducts.length === 0) return
    
    // Decode WMI SecurityCenter2 product state
    const decodeAvState = (state: number | string): { enabled: boolean; upToDate: boolean } => {
      const s = typeof state === 'string' ? parseInt(state, 10) : state
      if (isNaN(s)) return { enabled: false, upToDate: false }
      const enabled = ((s >> 12) & 0xF) === 1
      const upToDate = ((s >> 4) & 0xF) === 0
      return { enabled, upToDate }
    }

    // Delete old records
    const { error: deleteError } = await supabase
      .from('antivirus_status')
      .delete()
      .eq('agent_id', job.agent_id)
    
    if (deleteError) {
      logger.error('[submit-job-result] Error clearing old AV status:', deleteError)
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
      logger.error('[submit-job-result] Error inserting AV status:', insertError)
    } else {
      logger.debug(`[submit-job-result] [ZERO_TRUST] Inserted ${avRecords.length} AV status records`)
      sideEffects.inserted = true
      sideEffects.recordCount += avRecords.length
    }
  } catch (avErr) {
    logger.error('[submit-job-result] Error processing antivirus status:', avErr)
  }
}
