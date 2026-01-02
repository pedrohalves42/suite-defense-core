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

/**
 * Robust JSON extraction from AI responses
 * Handles: code blocks, extra text, irregular formatting
 */
function extractJSON(content: string): any {
  // Step 1: Remove code block markers
  let cleaned = content
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/g, '')
    .trim();
  
  // Step 2: Find JSON boundaries (first { to last })
  const firstBrace = cleaned.indexOf('{');
  const lastBrace = cleaned.lastIndexOf('}');
  
  if (firstBrace === -1 || lastBrace === -1 || lastBrace <= firstBrace) {
    console.error('[extractJSON] No valid JSON boundaries found');
    throw new Error('No valid JSON object found in content');
  }
  
  const jsonStr = cleaned.substring(firstBrace, lastBrace + 1);
  
  // Step 3: Attempt to parse
  try {
    return JSON.parse(jsonStr);
  } catch (firstError) {
    console.warn('[extractJSON] First parse attempt failed, trying cleanup...');
    
    // Step 4: Aggressive cleanup for malformed JSON
    const cleanedJson = jsonStr
      .replace(/[\r\n]+/g, ' ')           // Replace newlines with spaces
      .replace(/,\s*}/g, '}')             // Remove trailing commas before }
      .replace(/,\s*]/g, ']')             // Remove trailing commas before ]
      .replace(/\s+/g, ' ');              // Collapse multiple spaces
    
    try {
      return JSON.parse(cleanedJson);
    } catch (secondError) {
      console.error('[extractJSON] All parse attempts failed');
      console.error('[extractJSON] JSON string (first 500 chars):', jsonStr.substring(0, 500));
      throw new Error(`Failed to parse JSON: ${firstError}`);
    }
  }
}

/**
 * Calculate deterministic base score from metrics (no LLM variance)
 * This provides a stable foundation that Red Team adjusts as risk factor
 */
function calculateDeterministicScore(metrics: any): number {
  let score = 70; // Base score
  
  // Penalidades determinísticas
  const agents = metrics?.agents || {};
  const aiActions = metrics?.ai_actions || {};
  const rollbacks = metrics?.rollbacks || {};
  const users = metrics?.users || {};
  const dlq = metrics?.dlq || {};
  const criticalAlerts = metrics?.critical_alerts || {};
  const alerts = metrics?.alerts || {};
  
  // Agentes offline (-5 cada, max -15)
  if (agents.offline > 0) {
    score -= Math.min(agents.offline * 5, 15);
  }
  
  // Approval rate zero (-15)
  if (aiActions.approval_rate === 0 || aiActions.approved === 0) {
    score -= 15;
  }
  
  // Human reviewed zero (-10)
  if (aiActions.human_reviewed === 0) {
    score -= 10;
  }
  
  // Rollback never tested (-5)
  if (rollbacks.total === 0) {
    score -= 5;
  }
  
  // Single user system (-5)
  if ((users.count || 0) <= 1) {
    score -= 5;
  }
  
  // DLQ has items (-5 each, max -10)
  if (dlq.current > 0) {
    score -= Math.min(dlq.current * 5, 10);
  }
  
  // Critical alerts open (-3 each, max -9)
  if (criticalAlerts.open > 0) {
    score -= Math.min(criticalAlerts.open * 3, 9);
  }
  
  // Bônus determinísticos
  
  // Decision coverage = 100% (+5)
  if (alerts.decision_coverage_percent === 100) {
    score += 5;
  }
  
  // Evidence chain healthy (+5)
  if (metrics?.evidence_chain?.healthy === true) {
    score += 5;
  }
  
  // Shadow validation rate > 50% (+3)
  if ((aiActions.shadow_validation_rate || 0) > 50) {
    score += 3;
  }
  
  // DLQ resolution = 100% (+3)
  if (dlq.resolution_rate === 100) {
    score += 3;
  }
  
  return Math.max(20, Math.min(100, score));
}

/**
 * Calculate Red Team risk factor from red_score (0-100)
 * Returns multiplier between 0.7 and 1.0
 */
function calculateRiskFactor(redScore: number): number {
  // red_score 0 = no risk = factor 1.0
  // red_score 100 = max risk = factor 0.7
  return Math.max(0.7, 1 - (redScore / 333)); // 100/333 ≈ 0.3, so max reduction is 30%
}

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

    // Get user's tenant (supports users with multiple roles)
    const { data: userRoles } = await supabase
      .from('user_roles')
      .select('tenant_id, role')
      .eq('user_id', user.id);

    const adminRole = userRoles?.find(r => ['admin', 'super_admin'].includes(r.role));
    if (!adminRole) {
      return new Response(
        JSON.stringify({ error: 'Admin access required' }),
        { status: 403, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const tenantId = adminRole.tenant_id;
    console.log(`[ai-full-audit] Starting FULL audit for tenant ${tenantId} (Red → Ana → Gap)`);

    // Get metrics (shared between Red Team and Ana)
    // Pass user.id explicitly since service role doesn't have auth.uid() context
    const { data: metrics, error: metricsError } = await supabase
      .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId, p_user_id: user.id });

    if (metricsError) {
      console.error('Error fetching metrics:', metricsError);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch system metrics',
          stage: 'metrics',
          details: {
            code: metricsError.code ?? 'unknown',
            message: metricsError.message ?? 'unknown error'
          }
        }),
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

    // Red Team AI call with timeout and robust error handling
    const redController = new AbortController();
    const redTimeoutId = setTimeout(() => redController.abort(), 45000); // 45s timeout

    let redResponse: Response;
    try {
      redResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        signal: redController.signal,
      });
    } catch (fetchError: unknown) {
      clearTimeout(redTimeoutId);
      const err = fetchError as Error;
      if (err.name === 'AbortError') {
        console.error('[ai-full-audit] Red Team request timeout (45s)');
        return new Response(
          JSON.stringify({ error: 'Timeout na chamada Red Team (45s)', stage: 'red_team' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('[ai-full-audit] Red Team fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Erro de conexão com AI', stage: 'red_team' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      clearTimeout(redTimeoutId);
    }

    if (!redResponse.ok) {
      const errorText = await redResponse.text();
      console.error('[ai-full-audit] Red Team AI error:', redResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Red Team analysis failed', status: redResponse.status, stage: 'red_team' }),
        { status: redResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate response before parsing
    const redResponseText = await redResponse.text();
    console.log('[ai-full-audit] Red Team response length:', redResponseText.length);

    if (!redResponseText || redResponseText.length === 0) {
      console.error('[ai-full-audit] Empty response from Red Team AI');
      return new Response(
        JSON.stringify({ error: 'AI retornou resposta vazia', stage: 'red_team' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let redData;
    try {
      redData = JSON.parse(redResponseText);
    } catch (parseErr) {
      console.error('[ai-full-audit] Failed to parse Red Team AI response:', redResponseText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Resposta AI inválida (JSON malformado)', stage: 'red_team' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const redContent = redData.choices?.[0]?.message?.content;
    const redTokens = redData.usage?.total_tokens || 0;

    if (!redContent) {
      console.error('[ai-full-audit] No content in Red Team AI response:', JSON.stringify(redData).substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'AI não retornou conteúdo', stage: 'red_team' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let redResult;
    try {
      redResult = extractJSON(redContent);
    } catch (parseError) {
      console.error('[ai-full-audit] Failed to parse Red Team content:', redContent.substring(0, 500));
      console.error('[ai-full-audit] Parse error:', parseError);
      return new Response(
        JSON.stringify({ error: 'Failed to parse Red Team analysis', stage: 'red_team' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Save Red Team result with binary criteria
    const redPromptHash = `${redPersona.hash.slice(0, 8)}-${redTemplate.hash.slice(0, 8)}`;
    const binaryCriteria = redResult.binary_criteria || {};
    const criteriaCountTrue = redResult.criteria_count_true || 
      Object.values(binaryCriteria).filter((v: unknown) => v === true).length;
    
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
        binary_criteria: binaryCriteria,
        criteria_count_true: criteriaCountTrue,
      })
      .select()
      .single();

    if (redSaveError) {
      console.error('Error saving Red Team:', redSaveError);
    }
    
    console.log(`[ai-full-audit] Phase 1 complete. Red Score: ${redResult.red_score}, Threat: ${redResult.threat_level}, Criteria TRUE: ${criteriaCountTrue}`);

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

    // Ana AI call with timeout and robust error handling
    const anaController = new AbortController();
    const anaTimeoutId = setTimeout(() => anaController.abort(), 45000); // 45s timeout

    let anaResponse: Response;
    try {
      anaResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
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
        signal: anaController.signal,
      });
    } catch (fetchError: unknown) {
      clearTimeout(anaTimeoutId);
      const err = fetchError as Error;
      if (err.name === 'AbortError') {
        console.error('[ai-full-audit] Ana request timeout (45s)');
        return new Response(
          JSON.stringify({ error: 'Timeout na chamada Ana (45s)', stage: 'ana' }),
          { status: 504, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      console.error('[ai-full-audit] Ana fetch error:', fetchError);
      return new Response(
        JSON.stringify({ error: 'Erro de conexão com AI', stage: 'ana' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    } finally {
      clearTimeout(anaTimeoutId);
    }

    if (!anaResponse.ok) {
      const errorText = await anaResponse.text();
      console.error('[ai-full-audit] Ana AI error:', anaResponse.status, errorText);
      return new Response(
        JSON.stringify({ error: 'Ana analysis failed', status: anaResponse.status, stage: 'ana' }),
        { status: anaResponse.status, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Validate response before parsing
    const anaResponseText = await anaResponse.text();
    console.log('[ai-full-audit] Ana response length:', anaResponseText.length);

    if (!anaResponseText || anaResponseText.length === 0) {
      console.error('[ai-full-audit] Empty response from Ana AI');
      return new Response(
        JSON.stringify({ error: 'AI retornou resposta vazia', stage: 'ana' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let anaData;
    try {
      anaData = JSON.parse(anaResponseText);
    } catch (parseErr) {
      console.error('[ai-full-audit] Failed to parse Ana AI response:', anaResponseText.substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'Resposta AI inválida (JSON malformado)', stage: 'ana' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const anaContent = anaData.choices?.[0]?.message?.content;
    const anaTokens = anaData.usage?.total_tokens || 0;

    if (!anaContent) {
      console.error('[ai-full-audit] No content in Ana AI response:', JSON.stringify(anaData).substring(0, 500));
      return new Response(
        JSON.stringify({ error: 'AI não retornou conteúdo', stage: 'ana' }),
        { status: 502, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    let anaResult;
    try {
      anaResult = extractJSON(anaContent);
    } catch (parseError) {
      console.error('[ai-full-audit] Failed to parse Ana content:', anaContent.substring(0, 500));
      console.error('[ai-full-audit] Parse error:', parseError);
      return new Response(
        JSON.stringify({ error: 'Failed to parse Ana analysis', stage: 'ana' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // ============ SCORE GOVERNANCE: Guardrails + Moving Average ============
    console.log('[ai-full-audit] Applying score governance...');
    
    // Step 1: Calculate deterministic base score (no LLM variance)
    const deterministicBaseScore = calculateDeterministicScore(metrics);
    console.log(`[ai-full-audit] Deterministic base score: ${deterministicBaseScore}`);
    
    // Step 2: Calculate risk factor from Red Team
    const redRiskFactor = calculateRiskFactor(redResult.red_score);
    console.log(`[ai-full-audit] Red risk factor: ${redRiskFactor.toFixed(3)}`);
    
    // Step 3: Get previous audit for guardrail check
    const { data: prevAuditData } = await supabase
      .rpc('get_previous_audit_score', { p_tenant_id: tenantId });
    
    const previousScore = prevAuditData?.[0]?.previous_score || 70;
    const avgLast3 = prevAuditData?.[0]?.avg_last_3 || anaResult.overall_score;
    const avgLast7 = prevAuditData?.[0]?.avg_last_7 || anaResult.overall_score;
    
    // Step 4: Apply guardrail (max ±10 points variation)
    const rawScore = anaResult.overall_score;
    const rawDelta = rawScore - previousScore;
    let guardedScore = rawScore;
    let guardrailApplied = false;
    let guardrailReason: string | null = null;
    
    if (Math.abs(rawDelta) > 10) {
      const maxDelta = rawDelta > 0 ? 10 : -10;
      guardedScore = previousScore + maxDelta;
      guardrailApplied = true;
      guardrailReason = `Delta original ${rawDelta} limitado a ${maxDelta} (score anterior: ${previousScore})`;
      console.log(`[ai-full-audit] GUARDRAIL APPLIED: ${rawScore} -> ${guardedScore} (delta ${rawDelta} > 10)`);
    }
    
    // Step 5: Calculate official score (weighted moving average)
    // 50% current (guarded) + 30% avg_last_3 + 20% avg_last_7
    const officialScore = Math.round(
      0.5 * guardedScore +
      0.3 * avgLast3 +
      0.2 * avgLast7
    );
    
    // Step 6: Calculate market score (more conservative, smoother)
    // 30% current + 40% avg_3 + 30% avg_7, with floor adjustment
    let marketScore = Math.round(
      0.3 * guardedScore +
      0.4 * avgLast3 +
      0.3 * avgLast7
    );
    
    // Don't let market score drop below 40 unless confirmed trend
    if (marketScore < 40 && avgLast3 > 50) {
      marketScore = 50;
      console.log('[ai-full-audit] Market score floor applied (40 < market && avg3 > 50)');
    }
    
    console.log(`[ai-full-audit] Scores: raw=${rawScore}, guarded=${guardedScore}, official=${officialScore}, market=${marketScore}`);
    
    // Save Ana result with governance data
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
      overall_score: guardedScore, // Use guarded score as official overall
      raw_score: rawScore,
      official_score: officialScore,
      market_score: marketScore,
      deterministic_base_score: deterministicBaseScore,
      red_risk_factor: redRiskFactor,
      guardrail_applied: guardrailApplied,
      guardrail_reason: guardrailReason,
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

    console.log(`[ai-full-audit] Phase 2 complete. Raw: ${rawScore}, Official: ${officialScore}, Market: ${marketScore}, Guardrail: ${guardrailApplied}`);

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
          binary_criteria: redResult.binary_criteria || {},
          criteria_count_true: criteriaCountTrue,
        },
        
        // Phase 2: Ana with Governance
        ana: {
          audit_id: savedAna?.id,
          raw_score: rawScore,
          guarded_score: guardedScore,
          official_score: officialScore,
          market_score: marketScore,
          deterministic_base_score: deterministicBaseScore,
          red_risk_factor: redRiskFactor,
          guardrail_applied: guardrailApplied,
          guardrail_reason: guardrailReason,
          recommendation: anaResult.recommendation,
          falsification_count: anaResult.falsification_criteria?.length || 0,
          tokens_used: anaTokens,
        },
        
        // Phase 3: Confidence Gap
        confidence_gap: {
          gap_id: savedGap?.id,
          ana_score: guardedScore, // Use guarded score for gap
          red_score: redScore,
          gap: guardedScore - redScore, // Recalculate with guarded
          health_status: healthStatus,
          gap_delta: gapDelta,
          alert_triggered: alertTriggered,
          alert_reason: alertReason,
        },
        
        // Score Governance Summary
        governance: {
          previous_score: previousScore,
          avg_last_3: avgLast3,
          avg_last_7: avgLast7,
          guardrail_max_delta: 10,
          variance_reduced: guardrailApplied,
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