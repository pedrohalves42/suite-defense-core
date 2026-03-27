/**
 * Side-effects router: dispatches to the correct handler based on job.type
 * ZERO TRUST: All side-effects run BEFORE the job is marked completed
 */

import type { SubmitContext } from '../types.ts'
import { processSoftwareInventory } from './software-inventory.ts'
import { processWebActivity } from './web-activity.ts'
import { processAntivirusStatus } from './antivirus.ts'
import { processNetworkInfo } from './network-info.ts'
import { processCertificates } from './certificates.ts'
import { processDiskMetrics } from './disk-metrics.ts'

/**
 * Process all side-effects for a completed job.
 * Each handler checks job.type internally and is a no-op for non-matching types.
 */
export async function processSideEffects(ctx: SubmitContext): Promise<void> {
  if (ctx.payload.status !== 'completed') return
  
  await processSoftwareInventory(ctx)
  await processWebActivity(ctx)
  await processAntivirusStatus(ctx)
  await processNetworkInfo(ctx)
  await processCertificates(ctx)
  await processDiskMetrics(ctx)
}
