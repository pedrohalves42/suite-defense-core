/**
 * Side-effect: collect_disk_metrics processing
 */

import { logger } from '../../_shared/logger.ts'
import type { SubmitContext } from '../types.ts'

export async function processDiskMetrics(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, outputData, sideEffects } = ctx
  
  if (job.type !== 'collect_disk_metrics') return
  if (!outputData.drives && !outputData.disks && !outputData.disk_metrics) return
  
  try {
    logger.debug('[submit-job-result] [ZERO_TRUST] Processing disk metrics BEFORE marking completed...')
    const drives = (outputData.drives || outputData.disks || outputData.disk_metrics || []) as Array<Record<string, unknown>>
    
    if (!Array.isArray(drives) || drives.length === 0) return
    
    const collectedAt = outputData.collected_at
      ? new Date(String(outputData.collected_at)).toISOString()
      : new Date().toISOString()

    // Delete old records
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
      logger.error('[submit-job-result] Error inserting disk metrics:', insertError)
    } else {
      logger.debug(`[submit-job-result] [ZERO_TRUST] Inserted ${diskRecords.length} disk metric records`)
      sideEffects.inserted = true
      sideEffects.recordCount += diskRecords.length
    }
  } catch (diskErr) {
    logger.error('[submit-job-result] Error processing disk metrics:', diskErr)
  }
}
