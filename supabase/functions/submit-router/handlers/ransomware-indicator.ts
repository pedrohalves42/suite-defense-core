/**
 * Handler: ransomware indicator submission
 * Extracted from submit-ransomware-indicator/index.ts
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';

interface RansomwareIndicator {
  indicator_type: string; process_name?: string; process_pid?: number; process_path?: string;
  affected_path?: string; affected_files_count?: number; files_per_second?: number;
  entropy_score?: number; auto_response_taken?: string; sample_files?: string[];
  details?: Record<string, unknown>;
}

const INDICATOR_SEVERITY: Record<string, string> = {
  mass_encryption: 'critical', canary_triggered: 'critical', rapid_rename: 'critical',
  entropy_spike: 'high', suspicious_process: 'high',
};

export async function handleRansomwareIndicator(
  supabase: SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const { indicators } = body as { indicators: RansomwareIndicator[] };

  if (!Array.isArray(indicators) || indicators.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing indicators array' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  let insertedCount = 0;
  let alertsCreated = 0;
  const now = new Date().toISOString();

  const evidenceData = JSON.stringify({ agent_id: agentId, indicators, timestamp: now });
  const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidenceData));
  const evidenceHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

  for (const indicator of indicators) {
    const severity = INDICATOR_SEVERITY[indicator.indicator_type] || 'high';

    const { error: insertError } = await supabase.from('ransomware_indicators').insert({
      agent_id: agentId, tenant_id: tenantId, indicator_type: indicator.indicator_type, severity,
      process_name: indicator.process_name || null, process_pid: indicator.process_pid || null,
      process_path: indicator.process_path || null, affected_path: indicator.affected_path || null,
      affected_files_count: indicator.affected_files_count || 0,
      files_per_second: indicator.files_per_second || null, entropy_score: indicator.entropy_score || null,
      status: 'active', auto_response_taken: indicator.auto_response_taken || null,
      contained_at: indicator.auto_response_taken ? now : null, evidence_hash: evidenceHash,
      sample_files: indicator.sample_files || null, detected_at: now, details: indicator.details || {},
    });

    if (insertError) logger.error(`[${requestId}] Insert error:`, insertError);
    else insertedCount++;

    const typeLabels: Record<string, string> = {
      mass_encryption: 'Criptografia em massa detectada', rapid_rename: 'Renomeacao rapida de arquivos',
      suspicious_process: 'Processo suspeito de ransomware', canary_triggered: 'Arquivo canario modificado',
      entropy_spike: 'Pico de entropia em arquivos',
    };

    const { error: alertError } = await supabase.from('system_alerts').insert({
      tenant_id: tenantId, agent_id: agentId, alert_type: 'ransomware', severity: 'critical',
      title: '🚨 ALERTA DE RANSOMWARE',
      message: `${typeLabels[indicator.indicator_type] || indicator.indicator_type} no endpoint ${agentName}. ${
        indicator.affected_files_count ? `${indicator.affected_files_count} arquivos afetados.` : ''
      } ${indicator.process_name ? `Processo: ${indicator.process_name}` : ''} ${
        indicator.auto_response_taken ? `Acao automatica: ${indicator.auto_response_taken}` : 'ACAO MANUAL NECESSARIA'
      }`.trim(),
      acknowledged: false,
    });
    if (!alertError) alertsCreated++;
  }

  await supabase.from('agent_evidence_logs').insert({
    agent_id: agentId, tenant_id: tenantId, agent_name: agentName,
    event_type: 'ransomware_detection', event_data: { indicators, evidence_hash: evidenceHash },
    evidence_hash: evidenceHash, severity: 'critical',
  });

  logger.info(`[${requestId}] RANSOMWARE ALERT: ${insertedCount} indicators from ${agentName}, ${alertsCreated} alerts created`);
  return { success: true, inserted: insertedCount, alerts_created: alertsCreated, evidence_hash: evidenceHash };
}
