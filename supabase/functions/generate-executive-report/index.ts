// Edge Function: Generate Executive Report (Daily Risk Delta Narrative)
// Fase 2: Narrativa Executiva Contínua

import { corsHeaders } from '../_shared/cors.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2';
import { callAISimple } from '../_shared/ai-provider-helper.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface RiskDelta {
  tenantId: string;
  tenantName: string;
  snapshotDate: string;
  riskScoreStart: number | null;
  riskScoreEnd: number | null;
  delta: number;
  threatsBlocked: number;
  incidentsPrevented: number;
  actionsExecuted: number;
  actionsPendingApproval: number;
  keyEvents: Array<{
    type: string;
    severity: string;
    description: string;
    timestamp: string;
  }>;
}

async function generateExecutiveSummary(data: RiskDelta): Promise<string> {
  try {
    const prompt = `Você é um especialista em segurança cibernética. Gere um resumo executivo CURTO (máximo 3 frases) em português brasileiro sobre a situação de segurança do dia.

Dados do dia:
- Score de risco início do dia: ${data.riskScoreStart ?? 'Não disponível'}
- Score de risco fim do dia: ${data.riskScoreEnd ?? 'Não disponível'}
- Variação: ${data.delta > 0 ? '+' : ''}${data.delta} pontos
- Ameaças bloqueadas: ${data.threatsBlocked}
- Incidentes prevenidos: ${data.incidentsPrevented}
- Ações de segurança executadas: ${data.actionsExecuted}
- Ações aguardando aprovação: ${data.actionsPendingApproval}
${data.keyEvents.length > 0 ? `- Eventos principais: ${data.keyEvents.slice(0, 3).map(e => e.description).join('; ')}` : ''}

Regras:
1. Seja direto e objetivo
2. Foque no impacto para o negócio
3. Use linguagem simples (para donos de empresa)
4. Se o score melhorou, destaque. Se piorou, explique o risco.
5. Não use jargões técnicos`;

    const aiResult = await callAISimple(
      'Você é um especialista em segurança cibernética corporativa.',
      prompt,
      {
        maxTokens: 200,
        functionName: 'generate-executive-report',
        tenantId: data.tenantId,
      }
    );

    if (aiResult.success && aiResult.content) {
      return aiResult.content;
    }
    
    console.warn('[generate-executive-report] AI call failed, using fallback:', aiResult.error);
  } catch (error) {
    console.error('AI generation failed:', error);
  }

  return generateFallbackSummary(data);
}

function generateFallbackSummary(data: RiskDelta): string {
  const parts: string[] = [];

  // Risk trend
  if (data.delta < 0) {
    parts.push(`Seu nível de risco melhorou ${Math.abs(data.delta)} pontos hoje.`);
  } else if (data.delta > 0) {
    parts.push(`Atenção: seu nível de risco aumentou ${data.delta} pontos.`);
  } else {
    parts.push('Seu nível de risco permaneceu estável hoje.');
  }

  // Threats blocked
  if (data.threatsBlocked > 0) {
    parts.push(`${data.threatsBlocked} ameaça${data.threatsBlocked > 1 ? 's foram bloqueadas' : ' foi bloqueada'} automaticamente.`);
  }

  // Actions
  if (data.actionsExecuted > 0) {
    parts.push(`${data.actionsExecuted} ação${data.actionsExecuted > 1 ? 'ões de proteção foram executadas' : ' de proteção foi executada'}.`);
  }

  // Pending approvals
  if (data.actionsPendingApproval > 0) {
    parts.push(`${data.actionsPendingApproval} ação${data.actionsPendingApproval > 1 ? 'ões aguardam' : ' aguarda'} sua aprovação.`);
  }

  return parts.join(' ');
}

function estimateCostAvoided(data: RiskDelta): number {
  // Simple estimation based on industry averages
  // Average cost of a security incident: R$ 5.000 - R$ 50.000 for SMBs
  const baseIncidentCost = 10000; // R$ 10.000 per incident
  const threatCost = 500; // R$ 500 per blocked threat

  return (data.incidentsPrevented * baseIncidentCost) + (data.threatsBlocked * threatCost);
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response('ok', { headers: corsHeaders });
  }

  const startedAt = Date.now();
  const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

  try {
    // Parse request body
    let body: { tenantId?: string; date?: string; source?: string } = {};
    try {
      body = await req.json();
    } catch {
      // Empty body is fine for cron calls
    }

    // Validate origin - accept if:
    // 1. source === 'cron' (scheduled pg_cron call)
    // 2. Has valid internal secret header
    // 3. Has valid JWT auth header
    const internalSecret = req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const isCronCall = body.source === 'cron';
    const isInternalCall = internalSecret && internalSecret === expectedSecret;
    const authHeader = req.headers.get('Authorization');
    
    if (!isCronCall && !isInternalCall && !authHeader) {
      console.log('[generate-executive-report] Unauthorized: No valid origin');
      return new Response(
        JSON.stringify({ error: 'Unauthorized' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log(`[generate-executive-report] Authorized call from: ${isCronCall ? 'cron' : isInternalCall ? 'internal' : 'jwt'}`);
    
    const tenantId = body.tenantId;
    const targetDate = body.date || new Date().toISOString().split('T')[0];

    // If tenantId provided, generate for specific tenant
    // Otherwise, generate for all tenants (cron job mode)
    let tenantIds: string[] = [];

    if (tenantId) {
      tenantIds = [tenantId];
    } else {
      const { data: tenants } = await supabase
        .from('tenants')
        .select('id')
        .eq('is_active', true);
      tenantIds = tenants?.map(t => t.id) || [];
    }

    const results: Array<{ tenantId: string; success: boolean; summary?: string; error?: string }> = [];

    for (const tid of tenantIds) {
      try {
        // Get tenant info
        const { data: tenant } = await supabase
          .from('tenants')
          .select('name')
          .eq('id', tid)
          .single();

        // Get risk scores for the day
        const dayStart = `${targetDate}T00:00:00Z`;
        const dayEnd = `${targetDate}T23:59:59Z`;

        const { data: riskScores } = await supabase
          .from('risk_scores')
          .select('score, created_at')
          .eq('tenant_id', tid)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd)
          .order('created_at', { ascending: true });

        const scoreStart = riskScores?.[0]?.score || null;
        const scoreEnd = riskScores?.[riskScores.length - 1]?.score || null;

        // Get security events
        const { data: securityEvents } = await supabase
          .from('security_events')
          .select('severity, title, created_at')
          .eq('tenant_id', tid)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);

        // Get playbook executions
        const { data: playbookExecs } = await supabase
          .from('playbook_executions')
          .select('status')
          .eq('tenant_id', tid)
          .gte('triggered_at', dayStart)
          .lte('triggered_at', dayEnd);

        // Get approval requests
        const { data: approvalRequests } = await supabase
          .from('approval_requests')
          .select('status')
          .eq('tenant_id', tid)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);

        // Get blocked attempts (from policy enforcement)
        const { data: blockedAttempts } = await supabase
          .from('policy_enforcement_logs')
          .select('id')
          .eq('tenant_id', tid)
          .eq('blocked', true)
          .gte('created_at', dayStart)
          .lte('created_at', dayEnd);

        // Calculate metrics
        const threatsBlocked = blockedAttempts?.length || 0;
        const incidentsPrevented = securityEvents?.filter(e => e.severity === 'critical' || e.severity === 'high').length || 0;
        const actionsExecuted = playbookExecs?.filter(e => e.status === 'completed').length || 0;
        const actionsPending = approvalRequests?.filter(e => e.status === 'pending').length || 0;

        // Build key events
        const keyEvents = (securityEvents || [])
          .filter(e => e.severity === 'high' || e.severity === 'critical')
          .slice(0, 5)
          .map(e => ({
            type: 'security_event',
            severity: e.severity,
            description: e.title,
            timestamp: e.created_at,
          }));

        const riskData: RiskDelta = {
          tenantId: tid,
          tenantName: tenant?.name || 'Unknown',
          snapshotDate: targetDate,
          riskScoreStart: scoreStart,
          riskScoreEnd: scoreEnd,
          delta: (scoreEnd || 0) - (scoreStart || 0),
          threatsBlocked,
          incidentsPrevented,
          actionsExecuted,
          actionsPendingApproval: actionsPending,
          keyEvents,
        };

        // Generate summary
        const summary = await generateExecutiveSummary(riskData);
        const costAvoided = estimateCostAvoided(riskData);

        // Upsert snapshot
        const { error: upsertError } = await supabase
          .from('risk_delta_snapshots')
          .upsert({
            tenant_id: tid,
            snapshot_date: targetDate,
            risk_score_start: scoreStart,
            risk_score_end: scoreEnd,
            threats_blocked: threatsBlocked,
            incidents_prevented: incidentsPrevented,
            actions_executed: actionsExecuted,
            actions_pending_approval: actionsPending,
            estimated_cost_avoided: costAvoided,
            executive_summary: summary,
            key_events: keyEvents,
          }, {
            onConflict: 'tenant_id,snapshot_date',
          });

        if (upsertError) {
          console.error(`Failed to upsert snapshot for tenant ${tid}:`, upsertError);
          results.push({ tenantId: tid, success: false, error: upsertError.message });
        } else {
          results.push({ tenantId: tid, success: true, summary });
        }
      } catch (error) {
        console.error(`Error processing tenant ${tid}:`, error);
        results.push({ tenantId: tid, success: false, error: String(error) });
      }
    }

    const result = {
      success: true,
      date: targetDate,
      processed: results.length,
      results,
    };

    // Log observability
    await supabase.rpc('log_scheduled_job_run', {
      p_job_key: 'generate-executive-report',
      p_success: true,
      p_duration_ms: Date.now() - startedAt,
      p_result: result,
      p_processed_count: results.filter(r => r.success).length,
      p_job_source: 'cron'
    });

    return new Response(
      JSON.stringify(result),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    console.error('Error:', error);
    
    // Log error observability
    try {
      await supabase.rpc('log_scheduled_job_run', {
        p_job_key: 'generate-executive-report',
        p_success: false,
        p_duration_ms: Date.now() - startedAt,
        p_error: String(error),
        p_result: null,
        p_processed_count: 0,
        p_job_source: 'cron'
      });
    } catch (e) { console.warn('[generate-executive-report] Failed to log job run:', e); }
    
    return new Response(
      JSON.stringify({ success: false, error: String(error) }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
