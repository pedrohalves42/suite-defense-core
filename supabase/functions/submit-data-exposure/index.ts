import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { authenticateAgent } from '../_shared/agent-auth.ts';

/**
 * submit-data-exposure: Receives sensitive data exposure findings from agents
 * 
 * Detects: CPF, CNPJ, credit cards, medical records, API keys, passwords
 * Agent scans configured directories and reports matches with masked previews.
 * 
 * Auth: X-Agent-Token header (standard agent authentication)
 */

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

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

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  const requestId = crypto.randomUUID().slice(0, 8);

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Authenticate agent via X-Agent-Token
    const authResult = await authenticateAgent(supabase, req, 'submit-data-exposure');
    if (!authResult.success) {
      return authResult.response;
    }
    const agent = authResult.agent;

    const body = await req.json();
    const { findings } = body as { findings: ExposureFinding[] };

    if (!Array.isArray(findings)) {
      return new Response(JSON.stringify({ error: 'Missing findings array' }), {
        status: 400,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    let insertedCount = 0;
    let alertsCreated = 0;
    const now = new Date().toISOString();

    for (const finding of findings) {
      const severity = CATEGORY_SEVERITY[finding.data_category] || 'medium';

      const record = {
        agent_id: agent.id,
        tenant_id: agent.tenant_id,
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
            tenant_id: agent.tenant_id,
            agent_id: agent.id,
            alert_type: 'data_exposure',
            severity: severity === 'critical' ? 'critical' : 'high',
            title: 'Dados Sensíveis Expostos',
            message: `${finding.match_count} ocorrência(s) de ${categoryLabels[finding.data_category] || finding.data_category} encontrada(s) em ${finding.file_path} no endpoint ${agent.agent_name}`,
            acknowledged: false,
          });

        if (!alertError) alertsCreated++;
      }
    }

    console.log(`[${requestId}] Data exposure: ${insertedCount} findings, ${alertsCreated} alerts for agent ${agent.agent_name}`);

    return new Response(
      JSON.stringify({ success: true, inserted: insertedCount, alerts_created: alertsCreated }),
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
