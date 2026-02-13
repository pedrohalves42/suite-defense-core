/**
 * collect-certificates Edge Function
 * 
 * Receives certificate inventory from agents and stores in agent_certificates.
 * Detects expiring/expired certificates and creates alerts.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateAgent } from '../_shared/agent-auth.ts';

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  if (req.method !== 'POST') {
    return new Response(
      JSON.stringify({ error: 'Method not allowed' }),
      { status: 405, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const startedAt = Date.now();

  try {
    const supabase = createClient(
      Deno.env.get('SUPABASE_URL')!,
      Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!
    );

    // 1. Authenticate agent
    const authResult = await authenticateAgent(supabase, req, 'collect-certificates');
    if (!authResult.success) return authResult.response;
    const { agent } = authResult;

    // 2. Parse payload
    const body = await req.json();
    const certificates: CertificatePayload[] = body.certificates || [];

    if (!Array.isArray(certificates)) {
      return new Response(
        JSON.stringify({ error: 'certificates must be an array' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[${requestId}] [collect-certs] Agent ${agent.agent_name}: ${certificates.length} certificates`);

    const now = new Date();
    const nowIso = now.toISOString();
    const warningDate = new Date(now.getTime() + EXPIRY_WARNING_DAYS * 24 * 60 * 60 * 1000);
    let processedCount = 0;
    let expiringSoon = 0;
    let expiredCount = 0;

    // 3. Delete old certs for this agent and re-insert (snapshot approach)
    await supabase
      .from('agent_certificates')
      .delete()
      .eq('agent_id', agent.id);

    // 4. Insert new certificates
    const rows = certificates
      .filter((c) => c.thumbprint && c.subject)
      .map((cert) => {
        const validUntil = cert.valid_until ? new Date(cert.valid_until) : null;
        if (validUntil && validUntil < now) expiredCount++;
        else if (validUntil && validUntil < warningDate) expiringSoon++;

        return {
          agent_id: agent.id,
          tenant_id: agent.tenant_id,
          thumbprint: cert.thumbprint,
          subject: cert.subject,
          issuer: cert.issuer || null,
          valid_from: cert.valid_from || null,
          valid_until: cert.valid_until || null,
          cert_store: cert.cert_store || 'LocalMachine\\My',
          serial_number: cert.serial_number || null,
          key_usage: cert.key_usage || null,
          is_self_signed: cert.is_self_signed ?? false,
          collected_at: nowIso,
        };
      });

    if (rows.length > 0) {
      const { error } = await supabase.from('agent_certificates').insert(rows);
      if (error) {
        console.error(`[${requestId}] [collect-certs] Insert error:`, error.message);
      } else {
        processedCount = rows.length;
      }
    }

    // 5. Create alerts for expiring/expired certificates
    if (expiredCount > 0 || expiringSoon > 0) {
      const severity = expiredCount > 0 ? 'high' : 'medium';
      const message = expiredCount > 0
        ? `Agent "${agent.agent_name}" has ${expiredCount} expired certificate(s) and ${expiringSoon} expiring soon`
        : `Agent "${agent.agent_name}" has ${expiringSoon} certificate(s) expiring within ${EXPIRY_WARNING_DAYS} days`;

      // Avoid duplicate alerts
      const { data: existingAlert } = await supabase
        .from('system_alerts')
        .select('id')
        .eq('agent_id', agent.id)
        .eq('alert_type', 'certificate_expiry')
        .eq('resolved', false)
        .maybeSingle();

      if (!existingAlert) {
        await supabase.from('system_alerts').insert({
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'certificate_expiry',
          severity,
          message,
          resolved: false,
          metadata: {
            expired_count: expiredCount,
            expiring_soon: expiringSoon,
            total_certificates: processedCount,
            warning_days: EXPIRY_WARNING_DAYS,
            detected_at: nowIso,
          },
        });
      }
    }

    const durationMs = Date.now() - startedAt;

    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'collect-certificates',
        p_success: true,
        p_duration_ms: durationMs,
        p_result: { processed: processedCount, expired: expiredCount, expiring_soon: expiringSoon },
        p_processed_count: processedCount,
        p_job_source: 'agent',
      });
    } catch (_) { /* non-critical */ }

    console.log(`[${requestId}] [collect-certs] Done: ${processedCount} certs, ${expiredCount} expired, ${expiringSoon} expiring in ${durationMs}ms`);

    return new Response(
      JSON.stringify({
        success: true,
        certificates_processed: processedCount,
        expired_count: expiredCount,
        expiring_soon: expiringSoon,
      }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] [collect-certs] Error:`, error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Internal error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
