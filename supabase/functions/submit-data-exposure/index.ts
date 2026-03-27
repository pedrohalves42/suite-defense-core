/**
 * submit-data-exposure: Receives sensitive data exposure findings from agents
 * 
 * Detects: CPF, CNPJ, credit cards, medical records, API keys, passwords
 * Agent scans configured directories and reports matches with masked previews.
 * 
 * Migrated to serveAgent middleware (Phase 2, Step 2.4)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';

// Severity mapping by data category
const CATEGORY_SEVERITY: Record<string, string> = {
  cpf: 'high',
  cnpj: 'medium',
  credit_card: 'critical',
  medical_record: 'critical',
  password: 'critical',
  api_key: 'critical',
  email_list: 'medium',
  phone_list: 'low',
  rg: 'high',
  passport: 'high',
};

interface ExposureFinding {
  finding_type?: string;
  data_category: string;
  file_path: string;
  file_name?: string;
  file_size_bytes?: number;
  file_owner?: string;
  match_count: number;
  sample_preview?: string;
  detection_method?: string;
  confidence_score?: number;
  details?: Record<string, unknown>;
}

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const { findings } = body as { findings: ExposureFinding[] };

  if (!Array.isArray(findings)) {
    return new Response(JSON.stringify({ error: 'Missing findings array' }), {
      status: 400,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  let insertedCount = 0;
  let alertsCreated = 0;
  const now = new Date().toISOString();

  for (const finding of findings) {
    const severity = CATEGORY_SEVERITY[finding.data_category] || 'medium';

    const record = {
      agent_id: agentId,
      tenant_id: tenantId,
      finding_type: finding.finding_type || 'pii',
      data_category: finding.data_category,
      severity,
      file_path: finding.file_path,
      file_name: finding.file_name || finding.file_path.split(/[/\\]/).pop() || null,
      file_size_bytes: finding.file_size_bytes || null,
      file_owner: finding.file_owner || null,
      match_count: finding.match_count || 1,
      sample_preview: finding.sample_preview || null,
      detection_method: finding.detection_method || 'regex',
      confidence_score: finding.confidence_score ?? 100,
      status: 'open',
      detected_at: now,
      collected_at: now,
      details: finding.details || {},
    };

    const { error: insertError } = await supabase
      .from('data_exposure_findings')
      .insert(record);

    if (insertError) {
      console.error(`[${requestId}] Insert error:`, insertError);
    } else {
      insertedCount++;
    }

    // Create alert for critical/high findings
    if (severity === 'critical' || severity === 'high') {
      const categoryLabels: Record<string, string> = {
        cpf: 'CPF',
        cnpj: 'CNPJ',
        credit_card: 'Cartão de Crédito',
        medical_record: 'Prontuário Médico',
        password: 'Senha',
        api_key: 'Chave de API',
        rg: 'RG',
        passport: 'Passaporte',
      };

      const { error: alertError } = await supabase
        .from('system_alerts')
        .insert({
          tenant_id: tenantId,
          agent_id: agentId,
          alert_type: 'data_exposure',
          severity: severity === 'critical' ? 'critical' : 'high',
          title: 'Dados Sensíveis Expostos',
          message: `${finding.match_count} ocorrência(s) de ${categoryLabels[finding.data_category] || finding.data_category} encontrada(s) em ${finding.file_path} no endpoint ${agentName}`,
          acknowledged: false,
        });

      if (!alertError) alertsCreated++;
    }
  }

  console.log(`[${requestId}] Data exposure: ${insertedCount} findings, ${alertsCreated} alerts for agent ${agentName}`);

  return { success: true, inserted: insertedCount, alerts_created: alertsCreated };
});
