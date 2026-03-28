/**
 * Handler: certificates collection
 * Extracted from collect-certificates/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

interface CertificatePayload {
  thumbprint: string;
  subject: string;
  issuer?: string;
  valid_from?: string;
  valid_until?: string;
  cert_store?: string;
  serial_number?: string;
  key_usage?: string[];
  is_self_signed?: boolean;
}

const EXPIRY_WARNING_DAYS = 30;

export async function handleCertificates(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const startedAt = Date.now();
  const certificates: CertificatePayload[] = (body.certificates as CertificatePayload[]) || [];

  if (!Array.isArray(certificates)) {
    return new Response(
      JSON.stringify({ error: 'certificates must be an array' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  logger.info(`[${requestId}] [collect-certs] Agent ${agentName}: ${certificates.length} certificates`);

  const now = new Date();
  const nowIso = now.toISOString();
  const warningDate = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
  let processedCount = 0;
  let expiringSoon = 0;
  let expiredCount = 0;

  await supabase.from('agent_certificates').delete().eq('agent_id', agentId);

  const rows = certificates
    .filter((c) => c.thumbprint && c.subject)
    .map((cert) => {
      const validUntil = cert.valid_until ? new Date(cert.valid_until) : null;
      if (validUntil && validUntil < now) expiredCount++;
      else if (validUntil && validUntil < warningDate) expiringSoon++;

      return {
        agent_id: agentId, tenant_id: tenantId, thumbprint: cert.thumbprint,
        subject: cert.subject, issuer: cert.issuer || null,
        valid_from: cert.valid_from || null, valid_until: cert.valid_until || null,
        cert_store: cert.cert_store || 'LocalMachine\\My',
        serial_number: cert.serial_number || null, key_usage: cert.key_usage || null,
        is_self_signed: cert.is_self_signed ?? false, collected_at: nowIso,
      };
    });

  if (rows.length > 0) {
    const { error } = await supabase.from('agent_certificates').insert(rows);
    if (error) logger.error(`[${requestId}] [collect-certs] Insert error:`, error.message);
    else processedCount = rows.length;
  }

  if (expiredCount > 0 || expiringSoon > 0) {
    const severity = expiredCount > 0 ? 'high' : 'medium';
    const message = expiredCount > 0
      ? `Agent "${agentName}" has ${expiredCount} expired certificate(s) and ${expiringSoon} expiring soon`
      : `Agent "${agentName}" has ${expiringSoon} certificate(s) expiring within ${EXPIRY_WARNING_DAYS} days`;

    const { data: existingAlert } = await supabase
      .from('system_alerts').select('id')
      .eq('agent_id', agentId).eq('alert_type', 'certificate_expiry').eq('resolved', false)
      .maybeSingle();

    if (!existingAlert) {
      await supabase.from('system_alerts').insert({
        tenant_id: tenantId, agent_id: agentId, alert_type: 'certificate_expiry',
        severity, message, resolved: false,
        metadata: { expired_count: expiredCount, expiring_soon: expiringSoon, total_certificates: processedCount, warning_days: EXPIRY_WARNING_DAYS, detected_at: nowIso },
      });
    }
  }

  const durationMs = Date.now() - startedAt;
  try {
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'collect-certificates', p_success: true, p_duration_ms: durationMs,
      p_result: { processed: processedCount, expired: expiredCount, expiring_soon: expiringSoon },
      p_processed_count: processedCount, p_job_source: 'agent',
    });
  } catch (_) { /* non-critical */ }

  return { success: true, certificates_processed: processedCount, expired_count: expiredCount, expiring_soon: expiringSoon };
}
