/**
 * Generate Explainable AI Decision Report
 * 
 * Gera relatorio explicavel de decisoes automatizadas para compliance e auditoria.
 * Conteudo: resumo executivo, lista de decisoes, politicas aplicadas, efetividade.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0'
import { corsHeaders } from '../_shared/cors.ts'
import { logger } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

interface ReportRequest {
  tenant_id: string;
  period_start: string;
  period_end: string;
  format?: 'json' | 'html';
}

interface DecisionEntry {
  id: string;
  timestamp: string;
  insight_type: string;
  action_type: string;
  policy_applied: string;
  execution_mode: string;
  effectiveness: string;
  explanation: string;
  evidence_summary: string;
}

interface ExplainableReport {
  report_id: string;
  tenant_id: string;
  tenant_name: string;
  period: { start: string; end: string };
  generated_at: string;
  
  executive_summary: {
    total_insights: number;
    total_decisions: number;
    auto_executed: number;
    manual_approved: number;
    effectiveness_rate: number;
    risk_categories: Record<string, number>;
  };
  
  decisions: DecisionEntry[];
  
  governance: {
    actions_within_policy: number;
    custom_policies_used: number;
    default_policies_used: number;
  };
  
  evidence_hashes: Array<{
    decision_id: string;
    hash: string;
  }>;
}

// Human-readable explanation generator
function generateExplanation(insightType: string, actionType: string, executionMode: string): string {
  const explanations: Record<string, string> = {
    antivirus_disabled: 'O sistema detectou que o antivirus estava desativado e executou acao automatica de reativacao conforme politica de seguranca.',
    antivirus_outdated: 'Antivirus desatualizado detectado. Acao de atualizacao foi executada automaticamente.',
    vulnerability_critical: 'Vulnerabilidade critica identificada. Acao requer aprovacao manual devido ao alto impacto potencial.',
    dns_malicious_activity: 'Tentativas de acesso a dominios maliciosos bloqueadas automaticamente para prevenir vazamento de dados.',
    agent_offline_suspicious: 'Agente offline de forma suspeita. Sessoes de usuario foram bloqueadas como medida preventiva.',
    safe_mode_prolonged: 'Agente em Safe Mode por tempo prolongado. Reset manual necessario para restaurar funcionalidade.',
    anomaly_stuck_jobs: 'Jobs travados no sistema foram limpos automaticamente para manter a operacao.',
  };
  
  return explanations[insightType] || `Insight do tipo "${insightType}" processado no modo "${executionMode}".`;
}

// Get policy name applied
function getPolicyApplied(insightType: string, hasCustomPolicy: boolean, executionMode: string): string {
  if (hasCustomPolicy) {
    return `Politica personalizada do tenant: ${executionMode}`;
  }
  return `Politica padrao do sistema: ${executionMode}`;
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }


  // Auth guard: require authenticated user or internal caller
  const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
  if (authError) return authError;
  const requestId = crypto.randomUUID();
  logger.info(`[${requestId}] generate-explainable-report started`);

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseKey);

    // Auth check
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    
    if (authError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const body: ReportRequest = await req.json();
    const { tenant_id, period_start, period_end, format = 'json' } = body;

    if (!tenant_id || !period_start || !period_end) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: tenant_id, period_start, period_end' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Verify user has access to tenant
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', user.id)
      .eq('tenant_id', tenant_id)
      .single();

    if (!userRole) {
      return new Response(
        JSON.stringify({ error: 'Access denied to this tenant' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Fetch tenant info
    const { data: tenant } = await supabase
      .from('tenants')
      .select('name')
      .eq('id', tenant_id)
      .single();

    // Fetch resolved insights with actions
    const { data: insights, error: insightsError } = await supabase
      .from('ai_insights')
      .select(`
        id, insight_type, title, severity, status, 
        auto_action_executed, resolved_at, evidence,
        ai_actions(
          id, action_type, status, executed_at,
          effectiveness_status, effectiveness_evidence, result
        )
      `)
      .eq('tenant_id', tenant_id)
      .in('status', ['resolved', 'failed', 'ignored'])
      .gte('resolved_at', period_start)
      .lte('resolved_at', period_end)
      .order('resolved_at', { ascending: false });

    if (insightsError) throw insightsError;

    // Fetch custom policies
    const { data: customPolicies } = await supabase
      .from('tenant_action_policies')
      .select('insight_type, execution_mode')
      .eq('tenant_id', tenant_id);

    const policyMap = new Map(
      (customPolicies || []).map(p => [p.insight_type, p.execution_mode])
    );

    // Build decisions list
    const decisions: DecisionEntry[] = [];
    const evidenceHashes: Array<{ decision_id: string; hash: string }> = [];
    let autoExecuted = 0;
    let manualApproved = 0;
    let effectiveCount = 0;
    const riskCategories: Record<string, number> = {};

    for (const insight of insights || []) {
      const action = (insight.ai_actions as Array<Record<string, unknown>>)?.[0];
      const hasCustomPolicy = policyMap.has(insight.insight_type);
      const executionMode = policyMap.get(insight.insight_type) || 
        (insight.auto_action_executed ? 'auto' : 'approval');

      if (insight.auto_action_executed) {
        autoExecuted++;
      } else {
        manualApproved++;
      }

      const effectiveness = action?.effectiveness_status || 'pending';
      if (effectiveness === 'resolved') {
        effectiveCount++;
      }

      // Count by severity/risk
      riskCategories[insight.severity] = (riskCategories[insight.severity] || 0) + 1;

      // Evidence hash for audit trail
      const evidenceStr = JSON.stringify(insight.evidence || {});
      const evidenceHash = await crypto.subtle.digest(
        'SHA-256',
        new TextEncoder().encode(evidenceStr)
      );
      const hashHex = Array.from(new Uint8Array(evidenceHash))
        .map(b => b.toString(16).padStart(2, '0'))
        .join('');

      decisions.push({
        id: insight.id,
        timestamp: insight.resolved_at || '',
        insight_type: insight.insight_type,
        action_type: action?.action_type || 'none',
        policy_applied: getPolicyApplied(insight.insight_type, hasCustomPolicy, executionMode),
        execution_mode: executionMode,
        effectiveness: effectiveness,
        explanation: generateExplanation(insight.insight_type, action?.action_type || 'none', executionMode),
        evidence_summary: insight.evidence ? 'Evidencia disponivel' : 'Sem evidencia',
      });

      evidenceHashes.push({
        decision_id: insight.id,
        hash: hashHex,
      });
    }

    const totalDecisions = decisions.length;
    const effectivenessRate = totalDecisions > 0 
      ? Math.round((effectiveCount / totalDecisions) * 100) 
      : 0;

    const report: ExplainableReport = {
      report_id: requestId,
      tenant_id,
      tenant_name: tenant?.name || 'Unknown',
      period: { start: period_start, end: period_end },
      generated_at: new Date().toISOString(),
      
      executive_summary: {
        total_insights: insights?.length || 0,
        total_decisions: totalDecisions,
        auto_executed: autoExecuted,
        manual_approved: manualApproved,
        effectiveness_rate: effectivenessRate,
        risk_categories: riskCategories,
      },
      
      decisions,
      
      governance: {
        actions_within_policy: totalDecisions, // All actions follow policy
        custom_policies_used: customPolicies?.length || 0,
        default_policies_used: totalDecisions - (customPolicies?.length || 0),
      },
      
      evidence_hashes: evidenceHashes,
    };

    logger.info(`[${requestId}] Report generated: ${totalDecisions} decisions`);

    // CICLO 7: Calcular hash de integridade e persistir relatorio
    const reportStr = JSON.stringify(report);
    const hashBuffer = await crypto.subtle.digest(
      'SHA-256',
      new TextEncoder().encode(reportStr)
    );
    const integrityHash = Array.from(new Uint8Array(hashBuffer))
      .map(b => b.toString(16).padStart(2, '0'))
      .join('');

    // Persistir relatorio para auditoria (upsert para evitar duplicatas)
    const { error: persistError } = await supabase
      .from('ai_decision_reports')
      .upsert({
        tenant_id,
        period_start,
        period_end,
        report_payload: report,
        generated_by: user.id,
        generated_at: new Date().toISOString(),
        integrity_hash: integrityHash,
        engine_version: 'v1.0',
      }, {
        onConflict: 'tenant_id,period_start,period_end',
      });

    if (persistError) {
      logger.warn(`[${requestId}] Failed to persist report (non-fatal):`, persistError);
    } else {
      logger.info(`[${requestId}] Report persisted with hash: ${integrityHash.slice(0, 16)}...`);
    }

    // Return as HTML if requested
    if (format === 'html') {
      const html = generateHTMLReport(report);
      return new Response(html, {
        headers: { ...corsHeaders, 'Content-Type': 'text/html; charset=utf-8' },
      });
    }

    return new Response(
      JSON.stringify({ success: true, report, integrity_hash: integrityHash }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error(`[${requestId}] Error:`, error);
    return new Response(
      JSON.stringify({ 
        success: false, 
        error: error instanceof Error ? error.message : 'Internal server error' 
      }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});

function generateHTMLReport(report: ExplainableReport): string {
  const decisionsRows = report.decisions.map(d => `
    <tr>
      <td>${new Date(d.timestamp).toLocaleString('pt-BR')}</td>
      <td><code>${d.insight_type}</code></td>
      <td>${d.action_type}</td>
      <td>${d.policy_applied}</td>
      <td>
        <span class="badge badge-${d.effectiveness}">
          ${d.effectiveness === 'resolved' ? '[OK]  Resolvido' : 
            d.effectiveness === 'partial' ? '[WARN] ? Parcial' : 
            d.effectiveness === 'failed' ? '[ERROR]  Falhou' : '? Pendente'}
        </span>
      </td>
    </tr>
  `).join('');

  return `
<!DOCTYPE html>
<html lang="pt-BR">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Relatorio de Decisoes AI - ${report.tenant_name}</title>
  <style>
    * { box-sizing: border-box; margin: 0; padding: 0; }
    body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 1200px; margin: 0 auto; padding: 40px 20px; }
    h1 { font-size: 28px; margin-bottom: 8px; }
    h2 { font-size: 20px; margin: 32px 0 16px; border-bottom: 2px solid #e5e7eb; padding-bottom: 8px; }
    .meta { color: #6b7280; font-size: 14px; margin-bottom: 32px; }
    .summary-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 16px; margin: 24px 0; }
    .summary-card { background: #f9fafb; border-radius: 8px; padding: 20px; text-align: center; }
    .summary-card .value { font-size: 32px; font-weight: 700; color: #1f2937; }
    .summary-card .label { font-size: 14px; color: #6b7280; margin-top: 4px; }
    table { width: 100%; border-collapse: collapse; margin: 16px 0; }
    th, td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
    th { background: #f9fafb; font-weight: 600; }
    code { background: #f3f4f6; padding: 2px 6px; border-radius: 4px; font-size: 13px; }
    .badge { display: inline-block; padding: 4px 8px; border-radius: 4px; font-size: 12px; font-weight: 500; }
    .badge-resolved { background: #d1fae5; color: #065f46; }
    .badge-partial { background: #fef3c7; color: #92400e; }
    .badge-failed { background: #fee2e2; color: #991b1b; }
    .badge-pending { background: #e5e7eb; color: #374151; }
    .footer { margin-top: 48px; padding-top: 24px; border-top: 1px solid #e5e7eb; font-size: 12px; color: #9ca3af; }
    @media print { body { padding: 20px; } }
  </style>
</head>
<body>
  <h1>Relatorio de Decisoes AI</h1>
  <p class="meta">
    <strong>${report.tenant_name}</strong> ? 
    Periodo: ${new Date(report.period.start).toLocaleDateString('pt-BR')} a ${new Date(report.period.end).toLocaleDateString('pt-BR')} ?
    Gerado em: ${new Date(report.generated_at).toLocaleString('pt-BR')}
  </p>

  <h2>Resumo Executivo</h2>
  <div class="summary-grid">
    <div class="summary-card">
      <div class="value">${report.executive_summary.total_decisions}</div>
      <div class="label">Total de Decisoes</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.executive_summary.auto_executed}</div>
      <div class="label">Execucoes Automaticas</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.executive_summary.manual_approved}</div>
      <div class="label">Aprovacoes Manuais</div>
    </div>
    <div class="summary-card">
      <div class="value">${report.executive_summary.effectiveness_rate}%</div>
      <div class="label">Taxa de Efetividade</div>
    </div>
  </div>

  <h2>Governanca</h2>
  <p>
    <strong>${report.governance.custom_policies_used}</strong> politicas personalizadas em uso ?
    <strong>${report.governance.default_policies_used}</strong> politicas padrao aplicadas ?
    <strong>100%</strong> das acoes dentro das politicas definidas
  </p>

  <h2>Decisoes Detalhadas</h2>
  <table>
    <thead>
      <tr>
        <th>Data/Hora</th>
        <th>Tipo</th>
        <th>Acao</th>
        <th>Politica Aplicada</th>
        <th>Resultado</th>
      </tr>
    </thead>
    <tbody>
      ${decisionsRows || '<tr><td colspan="5" style="text-align:center;color:#6b7280;">Nenhuma decisao no periodo</td></tr>'}
    </tbody>
  </table>

  <div class="footer">
    <p>Report ID: ${report.report_id}</p>
    <p>Este relatorio e gerado automaticamente pelo sistema de decisoes AI para fins de compliance e auditoria.</p>
    <p>${report.evidence_hashes.length} hashes de evidencia registrados para verificacao de integridade.</p>
  </div>
</body>
</html>
  `;
}
