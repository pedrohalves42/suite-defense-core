/**
 * Side-effect: collect_certificates processing
 */

import { logger } from '../../_shared/logger.ts'
import type { SubmitContext } from '../types.ts'

export async function processCertificates(ctx: SubmitContext): Promise<void> {
  const { supabase, agent, job, outputData, sideEffects } = ctx
  
  if (job.type !== 'collect_certificates') return
  if (!outputData.certificates && !outputData.cert_store) return
  
  try {
    logger.debug('[submit-job-result] [ZERO_TRUST] Processing certificates BEFORE marking completed...')
    const certs = (outputData.certificates || outputData.cert_store || []) as Array<Record<string, unknown>>
    
    if (!Array.isArray(certs) || certs.length === 0) return
    
    const collectedAt = outputData.collected_at
      ? new Date(String(outputData.collected_at)).toISOString()
      : new Date().toISOString()

    // Delete old records
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
      logger.error('[submit-job-result] Error inserting certificates:', insertError)
    } else {
      logger.debug(`[submit-job-result] [ZERO_TRUST] Inserted ${uniqueCerts.length} certificate records`)
      sideEffects.inserted = true
      sideEffects.recordCount += uniqueCerts.length
    }
  } catch (certErr) {
    logger.error('[submit-job-result] Error processing certificates:', certErr)
  }
}
