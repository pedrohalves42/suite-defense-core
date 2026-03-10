import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateAgent } from '../_shared/agent-auth.ts';

/**
 * submit-ransomware-indicator: Receives ransomware detection signals from agents
 * 
 * Detects: mass encryption, rapid file rename, suspicious processes,
 * canary file triggers, entropy spikes.
 * 
 * Auth: X-Agent-Token header (standard agent authentication)
 * Auto-response: Creates critical alerts and logs forensic evidence.
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate agent via X-Agent-Token
    const authResult = await authenticateAgent(supabase, req, 'submit-ransomware-indicator');
    if (!authResult.success) {
      return authResult.response;
    }
    const agent = authResult.agent;

    const body = await req.json();
    const { indicators } = body as { indicators: RansomwareIndicator[] };

    if (!Array.isArray(indicators) || indicators.length === 0) {
      return new Response(JSON.stringify({ error: 'Missing indicators array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let insertedCount = 0;
    let alertsCreated = 0;
    const now = new Date().toISOString();

    // Generate evidence hash for the batch
    const evidenceData = JSON.stringify({ agent_id: agent.id, indicators, timestamp: now });
    const hashBuffer = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(evidenceData));
    const evidenceHash = Array.from(new Uint8Array(hashBuffer)).map(b => b.toString(16).padStart(2, '0')).join('');

    for (const indicator of indicators) {
      const severity = INDICATOR_SEVERITY[indicator.indicator_type] || 'high';

      const record = {
        agent_id: agent.id,
        tenant_id: agent.tenant_id,
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
      };

      const { error: insertError } = await supabase
        .from('ransomware_indicators')
        .insert(record);

      if (insertError) {
        console.error(`[${requestId}] Insert error:`, insertError);
      } else {
        insertedCount++;
      }

      // ALWAYS create critical alert for ransomware
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
          tenant_id: agent.tenant_id,
          agent_id: agent.id,
          alert_type: 'ransomware',
          severity: 'critical',
          title: '🚨 ALERTA DE RANSOMWARE',
          message: `${typeLabels[indicator.indicator_type] || indicator.indicator_type} no endpoint ${agent.agent_name}. ${
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
      agent_id: agent.id,
      tenant_id: agent.tenant_id,
      agent_name: agent.agent_name,
      event_type: 'ransomware_detection',
      event_data: { indicators, evidence_hash: evidenceHash },
      evidence_hash: evidenceHash,
      severity: 'critical',
    });

    console.log(`[${requestId}] RANSOMWARE ALERT: ${insertedCount} indicators from ${agent.agent_name}, ${alertsCreated} alerts created`);

    return new Response(
      JSON.stringify({ success: true, inserted: insertedCount, alerts_created: alertsCreated, evidence_hash: evidenceHash }),
      { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
