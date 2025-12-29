import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";

/**
 * AI Full Audit Orchestrator
 * 
 * Executes audits in anti-bias order:
 * 1. Red Team (adversarial, no prior context)
 * 2. Ana (with red_team_handoff context)
 * 3. Confidence Gap calculation
 * 
 * This order ensures Red Team isn't influenced by Ana's optimism.
 */

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const supabase = createClient(supabaseUrl, supabaseKey);

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await supabase.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id)
      .single();

    if (!userRole || !['admin', 'super_admin'].includes(userRole.role)) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = userRole.tenant_id;
    console.log(`[ai-full-audit] Starting FULL audit for tenant ${tenantId} (Red → Ana → Gap)`);

    // Get metrics (shared between Red Team and Ana)
    const { data: metrics, error: metricsError } = await supabase
      .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });

    if (metricsError) {
      console.error('Error fetching metrics:', metricsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch system metrics' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============ PHASE 1: RED TEAM (FIRST - NO BIAS) ============
    console.log('[ai-full-audit] Phase 1: Running Red Team assessment...');

    const redPersona = await AIPromptRegistry.getPromptWithMetadata('red-team-persona');
    const redTemplate = await AIPromptRegistry.getPromptWithMetadata('red-team-analysis-template');

    if (!redPersona || !redTemplate) {
      return new Response(
        JSON.stringify({ error: 'Red Team prompt configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logPromptUsage('red-team-persona', redPersona.hash, tenantId, 'ai-full-audit', { phase: 1 });
    logPromptUsage('red-team-analysis-template', redTemplate.hash, tenantId, 'ai-full-audit', { phase: 1 });

    // Red Team runs WITHOUT Ana summary (anti-bias)
    const redPrompt = redTemplate.content
      .replace('{metrics}', JSON.stringify(metrics, null, 2))
      .replace('{ana_summary}', 'Nenhuma análise Ana disponível - executando Red Team primeiro para evitar viés otimista.');

    const redResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: redPersona.content },
          { role: 'user', content: redPrompt }
        ],
      }),
    });

    if (!redResponse.ok) {
      const errorText = await redResponse.text();
      console.error('Red Team AI error:', redResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Red Team analysis failed', status: redResponse.status }),
        { status: redResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const redData = await redResponse.json();
    const redContent = redData.choices?.[0]?.message?.content;
    const redTokens = redData.usage?.total_tokens || 0;

    let redResult;
    try {
      let jsonContent = redContent;
      if (jsonContent.includes('```json')) {
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonContent.includes('```')) {
        jsonContent = jsonContent.replace(/```\n?/g, '');
      }
      redResult = JSON.parse(jsonContent.trim());
    } catch (parseError) {
      console.error('Failed to parse Red Team response:', redContent);
      return new Response(
        JSON.stringify({ error: 'Failed to parse Red Team analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save Red Team result
    const redPromptHash = `${redPersona.hash.slice(0, 8)}-${redTemplate.hash.slice(0, 8)}`;
    const { data: savedRed, error: redSaveError } = await supabase
      .from('red_team_assessments')
      .insert({
        tenant_id: tenantId,
        threat_level: redResult.threat_level || 'medium',
        red_score: redResult.red_score || 50,
        attack_vectors: redResult.attack_vectors || [],
        residual_risks: redResult.residual_risks || [],
        threat_system_identity: redResult.dimension_threats?.system_identity,
        threat_governance: redResult.dimension_threats?.governance,
        threat_evidence_proof: redResult.dimension_threats?.evidence_proof,
        threat_human_oversight: redResult.dimension_threats?.human_oversight,
        threat_operational_resilience: redResult.dimension_threats?.operational_resilience,
        threat_cross_tenant_isolation: redResult.dimension_threats?.cross_tenant_isolation,
        threat_transparency_explainability: redResult.dimension_threats?.transparency_explainability,
        threat_compliance_alignment: redResult.dimension_threats?.compliance_alignment,
        threat_market_trust: redResult.dimension_threats?.market_trust,
        executive_threat_summary: redResult.executive_threat_summary,
        worst_case_scenario: redResult.worst_case_scenario,
        recommended_hardening: redResult.recommended_hardening || [],
        ai_model: 'google/gemini-2.5-flash',
        ai_prompt_hash: redPromptHash,
        ai_response_raw: redResult,
        metrics_snapshot: metrics,
      })
      .select()
      .single();

    if (redSaveError) {
      console.error('Error saving Red Team:', redSaveError);
    }

    console.log(`[ai-full-audit] Phase 1 complete. Red Score: ${redResult.red_score}, Threat: ${redResult.threat_level}`);

    // ============ PHASE 2: ANA (WITH RED TEAM CONTEXT) ============
    console.log('[ai-full-audit] Phase 2: Running Ana audit with Red Team handoff...');

    const anaPersona = await AIPromptRegistry.getPromptWithMetadata('ana-auditor-persona');
    const anaTemplate = await AIPromptRegistry.getPromptWithMetadata('ana-analysis-template');

    if (!anaPersona || !anaTemplate) {
      return new Response(
        JSON.stringify({ error: 'Ana prompt configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logPromptUsage('ana-auditor-persona', anaPersona.hash, tenantId, 'ai-full-audit', { phase: 2 });
    logPromptUsage('ana-analysis-template', anaTemplate.hash, tenantId, 'ai-full-audit', { phase: 2 });

    // Build Ana prompt with RED TEAM CONTEXT
    const redTeamContext = `
CONTEXTO RED TEAM (para calibrar sua análise):
- Red Score: ${redResult.red_score}/100 (quanto maior, mais vulnerável)
- Threat Level: ${redResult.threat_level}
- Principais vetores de ataque identificados: ${redResult.attack_vectors?.slice(0, 3).map((v: any) => v.name).join(', ') || 'nenhum'}
- Pior cenário: ${redResult.worst_case_scenario || 'não especificado'}
- Challenge à análise otimista: ${redResult.challenge_to_ana || 'nenhum'}

INSTRUÇÃO: Considere esses riscos ao avaliar. Seu score deve refletir consciência das ameaças.
`;

    const anaPrompt = anaTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2) + '\n\n' + redTeamContext);

    const anaResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: anaPersona.content },
          { role: 'user', content: anaPrompt }
        ],
      }),
    });

    if (!anaResponse.ok) {
      const errorText = await anaResponse.text();
      console.error('Ana AI error:', anaResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Ana analysis failed', status: anaResponse.status }),
        { status: anaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anaData = await anaResponse.json();
    const anaContent = anaData.choices?.[0]?.message?.content;
    const anaTokens = anaData.usage?.total_tokens || 0;

    let anaResult;
    try {
      let jsonContent = anaContent;
      if (jsonContent.includes('```json')) {
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonContent.includes('```')) {
        jsonContent = jsonContent.replace(/```\n?/g, '');
      }
      anaResult = JSON.parse(jsonContent.trim());
    } catch (parseError) {
      console.error('Failed to parse Ana response:', anaContent);
      return new Response(
        JSON.stringify({ error: 'Failed to parse Ana analysis' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save Ana result
    const anaPromptHash = `${anaPersona.hash.slice(0, 8)}-${anaTemplate.hash.slice(0, 8)}`;
    
    // Map dimension names to columns
    const dimensionMapping: Record<string, { scoreCol: string; analysisCol: string }> = {
      'system_identity': { scoreCol: 'score_system_identity', analysisCol: 'analysis_system_identity' },
      'governance': { scoreCol: 'score_control_vs_monitor', analysisCol: 'analysis_control_vs_monitor' },
      'evidence_proof': { scoreCol: 'score_evidence_proof', analysisCol: 'analysis_evidence_proof' },
      'human_oversight': { scoreCol: 'score_maturity', analysisCol: 'analysis_maturity' },
      'operational_resilience': { scoreCol: 'score_failure_handling', analysisCol: 'analysis_failure_handling' },
      'cross_tenant_isolation': { scoreCol: 'score_limitations', analysisCol: 'analysis_limitations' },
      'transparency_explainability': { scoreCol: 'score_operational_trust', analysisCol: 'analysis_operational_trust' },
      'compliance_alignment': { scoreCol: 'score_market_value', analysisCol: 'analysis_market_value' },
      'market_trust': { scoreCol: 'score_simplicity', analysisCol: 'analysis_simplicity' },
    };

    const insertData: Record<string, any> = {
      tenant_id: tenantId,
      created_by: user.id,
      overall_score: anaResult.overall_score,
      executive_summary: anaResult.executive_summary,
      final_sentence: anaResult.final_sentence,
      recommendation: anaResult.recommendation,
      metrics_snapshot: metrics,
      ai_model: 'google/gemini-2.5-flash',
      prompt_hash: anaPromptHash,
      tokens_used: anaTokens,
      evidence_basis: anaResult.evidence_basis || [],
      falsification_criteria: anaResult.falsification_criteria || [],
    };

    for (const [dimKey, mapping] of Object.entries(dimensionMapping)) {
      const dim = anaResult.dimensions?.[dimKey];
      if (dim) {
        insertData[mapping.scoreCol] = dim.score;
        insertData[mapping.analysisCol] = dim.analysis;
      }
    }

    const { data: savedAna, error: anaSaveError } = await supabase
      .from('system_audits')
      .insert(insertData)
      .select()
      .single();

    if (anaSaveError) {
      console.error('Error saving Ana audit:', anaSaveError);
    }

    console.log(`[ai-full-audit] Phase 2 complete. Ana Score: ${anaResult.overall_score}, Recommendation: ${anaResult.recommendation}`);

    // ============ PHASE 3: CONFIDENCE GAP ============
    console.log('[ai-full-audit] Phase 3: Calculating Confidence Gap...');

    const anaScore = anaResult.overall_score;
    const redScore = redResult.red_score;
    const gap = anaScore - redScore;

    // Determine health status
    let healthStatus: 'healthy' | 'attention' | 'critical';
    if (gap > 40) {
      healthStatus = 'healthy';
    } else if (gap >= 20) {
      healthStatus = 'attention';
    } else {
      healthStatus = 'critical';
    }

    // Get previous gap for delta calculation
    const { data: prevGap } = await supabase
      .from('audit_confidence_gaps')
      .select('confidence_gap')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .single();

    const previousGap = prevGap?.confidence_gap || null;
    const gapDelta = previousGap !== null ? gap - previousGap : null;

    // Calculate dimension gaps
    const dimensionGaps: Record<string, number> = {};
    const dims = ['system_identity', 'governance', 'evidence_proof', 'human_oversight', 
                  'operational_resilience', 'cross_tenant_isolation', 'transparency_explainability',
                  'compliance_alignment', 'market_trust'];
    
    for (const dim of dims) {
      const anaScore = anaResult.dimensions?.[dim]?.score || 0;
      const redThreat = redResult.dimension_threats?.[dim] || 0;
      dimensionGaps[dim] = anaScore - redThreat;
    }

    // Alert logic
    let alertTriggered = false;
    let alertReason: string | null = null;

    if (healthStatus === 'critical') {
      alertTriggered = true;
      alertReason = `Gap crítico: ${gap} pontos. Risco elevado de compromisso.`;
    } else if (gapDelta !== null && gapDelta < -10) {
      alertTriggered = true;
      alertReason = `Degradação significativa: gap caiu ${Math.abs(gapDelta)} pontos.`;
    }

    // Save confidence gap
    const { data: savedGap, error: gapSaveError } = await supabase
      .from('audit_confidence_gaps')
      .insert({
        tenant_id: tenantId,
        audit_id: savedAna?.id,
        red_team_id: savedRed?.id,
        ana_score: anaScore,
        red_score: redScore,
        confidence_gap: gap,
        health_status: healthStatus,
        previous_gap: previousGap,
        gap_delta: gapDelta,
        alert_triggered: alertTriggered,
        alert_reason: alertReason,
        dimension_gaps: dimensionGaps,
      })
      .select()
      .single();

    if (gapSaveError) {
      console.error('Error saving confidence gap:', gapSaveError);
    }

    console.log(`[ai-full-audit] Phase 3 complete. Gap: ${gap} (${healthStatus}), Alert: ${alertTriggered}`);
    console.log(`[ai-full-audit] FULL AUDIT COMPLETE. Total tokens: ${redTokens + anaTokens}`);

    return new Response(
      JSON.stringify({
        success: true,
        execution_order: 'red_team → ana → gap',
        
        // Phase 1: Red Team
        red_team: {
          assessment_id: savedRed?.id,
          threat_level: redResult.threat_level,
          red_score: redResult.red_score,
          attack_vectors_count: redResult.attack_vectors?.length || 0,
          tokens_used: redTokens,
        },
        
        // Phase 2: Ana
        ana: {
          audit_id: savedAna?.id,
          overall_score: anaResult.overall_score,
          recommendation: anaResult.recommendation,
          falsification_count: anaResult.falsification_criteria?.length || 0,
          tokens_used: anaTokens,
        },
        
        // Phase 3: Confidence Gap
        confidence_gap: {
          gap_id: savedGap?.id,
          ana_score: anaScore,
          red_score: redScore,
          gap: gap,
          health_status: healthStatus,
          gap_delta: gapDelta,
          alert_triggered: alertTriggered,
          alert_reason: alertReason,
        },
        
        // Summary
        total_tokens: redTokens + anaTokens,
        prompt_versions: {
          red_persona: redPersona.version,
          red_template: redTemplate.version,
          ana_persona: anaPersona.version,
          ana_template: anaTemplate.version,
        },
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ai-full-audit] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});