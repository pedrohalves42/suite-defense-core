/**
 * submit-ransomware-indicator: Receives ransomware detection signals from agents
 * Migrated to serveAgent middleware
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

interface RansomwareIndicator {
  indicator_type: string;
  process_name?: string;
  process_pid?: number;
  process_path?: string;
  affected_path?: string;
  affected_files_count?: number;
  files_per_second?: number;
  entropy_score?: number;
  auto_response_taken?: string;
  sample_files?: string[];
  details?: Record<string, unknown>;
}

const INDICATOR_SEVERITY: Record<string, string> = {
  mass_encryption: 'critical',
  canary_triggered: 'critical',
  rapid_rename: 'critical',
  entropy_spike: 'high',
  suspicious_process: 'high',
};

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const { indicators } = body as { indicators: RansomwareIndicator[] };

  if (!Array.isArray(indicators) || indicators.length === 0) {
    return new Response(JSON.stringify({ error: 'Missing indicators array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
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

    const { error: insertError } = await supabase
      .from('ransomware_indicators')
      .insert({
        agent_id: agentId,
        tenant_id: tenantId,
        indicator_type: indicator.indicator_type,
        severity,
        process_name: indicator.process_name || null,
        process_pid: indicator.process_pid || null,
        process_path: indicator.process_path || null,
        affected_path: indicator.affected_path || null,
        affected_files_count: indicator.affected_files_count || 0,
        files_per_second: indicator.files_per_second || null,
        entropy_score: indicator.entropy_score || null,
        status: 'active',
        auto_response_taken: indicator.auto_response_taken || null,
        contained_at: indicator.auto_response_taken ? now : null,
        evidence_hash: evidenceHash,
        sample_files: indicator.sample_files || null,
        detected_at: now,
        details: indicator.details || {},
      });

    if (insertError) {
      logger.error(`[${requestId}] Insert error:`, insertError);
    } else {
      insertedCount++;
    }

    const typeLabels: Record<string, string> = {
      mass_encryption: 'Criptografia em massa detectada',
      rapid_rename: 'Renomeação rápida de arquivos',
      suspicious_process: 'Processo suspeito de ransomware',
      canary_triggered: 'Arquivo canário modificado',
      entropy_spike: 'Pico de entropia em arquivos',
    };

    const { error: alertError } = await supabase
      .from('system_alerts')
      .insert({
        tenant_id: tenantId,
        agent_id: agentId,
        alert_type: 'ransomware',
        severity: 'critical',
        title: '🚨 ALERTA DE RANSOMWARE',
        message: `${typeLabels[indicator.indicator_type] || indicator.indicator_type} no endpoint ${agentName}. ${
          indicator.affected_files_count ? `${indicator.affected_files_count} arquivos afetados.` : ''
        } ${indicator.process_name ? `Processo: ${indicator.process_name}` : ''} ${
          indicator.auto_response_taken ? `Ação automática: ${indicator.auto_response_taken}` : 'AÇÃO MANUAL NECESSÁRIA'
        }`.trim(),
        acknowledged: false,
      });

    if (!alertError) alertsCreated++;
  }

  // Log forensic evidence
  await supabase.from('agent_evidence_logs').insert({
    agent_id: agentId,
    tenant_id: tenantId,
    agent_name: agentName,
    event_type: 'ransomware_detection',
    event_data: { indicators, evidence_hash: evidenceHash },
    evidence_hash: evidenceHash,
    severity: 'critical',
  });

  // Publish IoCs to CyberShield Threat Network
  try {
    const iocs: Array<Record<string, unknown>> = [];
    for (const indicator of indicators) {
      if (indicator.process_name) {
        iocs.push({
          type: 'domain',
          value: `process:${indicator.process_name.toLowerCase()}`,
          severity: 'critical',
          tags: ['ransomware', indicator.indicator_type, 'cybershield_network'],
          context: 'ransomware_indicator',
          source_tenant_id: tenantId,
          metadata: {
            indicator_type: indicator.indicator_type,
            affected_files_count: indicator.affected_files_count,
            source_agent: agentName,
          },
        });
      }
      if (indicator.details?.extension) {
        iocs.push({
          type: 'domain',
          value: `ransomware_extension:${indicator.details.extension}`,
          severity: 'high',
          tags: ['ransomware', 'file_extension', 'cybershield_network'],
          context: 'ransomware_indicator',
          source_tenant_id: tenantId,
          metadata: { extension: indicator.details.extension },
        });
      }
    }

    if (iocs.length > 0) {
      const internalSecret = Deno.env.get('INTERNAL_SECRET');
      if (internalSecret) {
        await supabase.functions.invoke('publish-threat-ioc', {
          body: { iocs, detection_type: 'ransomware', source_agent_name: agentName },
          headers: { 'X-Internal-Secret': internalSecret },
        });
        logger.info(`[${requestId}] Published ${iocs.length} IoCs to CyberShield Threat Network`);
      }
    }
  } catch (threatNetErr) {
    logger.error(`[${requestId}] Failed to publish to Threat Network (non-blocking):`, threatNetErr);
  }

  logger.info(`[${requestId}] RANSOMWARE ALERT: ${insertedCount} indicators from ${agentName}, ${alertsCreated} alerts created`);
  return { success: true, inserted: insertedCount, alerts_created: alertsCreated, evidence_hash: evidenceHash };
});
