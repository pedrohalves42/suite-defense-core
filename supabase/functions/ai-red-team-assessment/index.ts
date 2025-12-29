import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";

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

    // Parse request body for optional ana_summary
    let anaSummary = '';
    try {
      const body = await req.json();
      anaSummary = body.ana_summary || '';
    } catch {
      // No body or invalid JSON - that's fine
    }

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
    console.log(`[ai-red-team-assessment] Starting Red Team assessment for tenant ${tenantId}`);

    // Get prompts from registry
    const personaPrompt = await AIPromptRegistry.getPromptWithMetadata('red-team-persona');
    const analysisTemplate = await AIPromptRegistry.getPromptWithMetadata('red-team-analysis-template');

    if (!personaPrompt || !analysisTemplate) {
      console.error('Failed to load Red Team prompts from registry');
      return new Response(
        JSON.stringify({ error: 'Prompt configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log prompt usage
    logPromptUsage('red-team-persona', personaPrompt.hash, tenantId, 'ai-red-team-assessment');
    logPromptUsage('red-team-analysis-template', analysisTemplate.hash, tenantId, 'ai-red-team-assessment');

    // Get raw metrics
    const { data: metrics, error: metricsError } = await supabase
      .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });

    if (metricsError) {
      console.error('Error fetching metrics:', metricsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch system metrics' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // If no ana_summary provided, try to get the latest audit
    if (!anaSummary) {
      const { data: latestAudit } = await supabase
        .from('system_audits')
        .select('executive_summary, recommendation, overall_score')
        .eq('tenant_id', tenantId)
        .order('created_at', { ascending: false })
        .limit(1)
        .single();

      if (latestAudit) {
        anaSummary = `Score: ${latestAudit.overall_score}/100. Recommendation: ${latestAudit.recommendation}. Summary: ${latestAudit.executive_summary}`;
      } else {
        anaSummary = 'Nenhuma auditoria anterior disponível.';
      }
    }

    console.log('[ai-red-team-assessment] Metrics collected, Ana summary available');

    // Build analysis prompt
    let analysisPrompt = analysisTemplate.content
      .replace('{metrics}', JSON.stringify(metrics, null, 2))
      .replace('{ana_summary}', anaSummary);

    // Call Lovable AI
    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: personaPrompt.content },
          { role: 'user', content: analysisPrompt }
        ],
      }),
    });

    if (!aiResponse.ok) {
      const errorText = await aiResponse.text();
      console.error('AI API error:', aiResponse.status, errorText);
      
      if (aiResponse.status === 429) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResponse.status === 402) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI analysis failed' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const aiData = await aiResponse.json();
    const aiContent = aiData.choices?.[0]?.message?.content;
    const tokensUsed = aiData.usage?.total_tokens || 0;

    if (!aiContent) {
      console.error('No content in AI response');
      return new Response(
        JSON.stringify({ error: 'AI returned empty response' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Parse AI response
    let analysisResult;
    try {
      let jsonContent = aiContent;
      if (jsonContent.includes('```json')) {
        jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      } else if (jsonContent.includes('```')) {
        jsonContent = jsonContent.replace(/```\n?/g, '');
      }
      analysisResult = JSON.parse(jsonContent.trim());
    } catch (parseError) {
      console.error('Failed to parse AI response:', aiContent);
      return new Response(
        JSON.stringify({ error: 'Failed to parse AI analysis', raw: aiContent }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    const combinedPromptHash = `${personaPrompt.hash.slice(0, 8)}-${analysisTemplate.hash.slice(0, 8)}`;

    // Save Red Team assessment to database
    const { data: savedAssessment, error: saveError } = await supabase
      .from('red_team_assessments')
      .insert({
        tenant_id: tenantId,
        threat_level: analysisResult.threat_level || 'medium',
        red_score: analysisResult.red_score || 50,
        attack_vectors: analysisResult.attack_vectors || [],
        residual_risks: analysisResult.residual_risks || [],
        threat_system_identity: analysisResult.dimension_threats?.system_identity,
        threat_governance: analysisResult.dimension_threats?.governance,
        threat_evidence_proof: analysisResult.dimension_threats?.evidence_proof,
        threat_human_oversight: analysisResult.dimension_threats?.human_oversight,
        threat_operational_resilience: analysisResult.dimension_threats?.operational_resilience,
        threat_cross_tenant_isolation: analysisResult.dimension_threats?.cross_tenant_isolation,
        threat_transparency_explainability: analysisResult.dimension_threats?.transparency_explainability,
        threat_compliance_alignment: analysisResult.dimension_threats?.compliance_alignment,
        threat_market_trust: analysisResult.dimension_threats?.market_trust,
        executive_threat_summary: analysisResult.executive_threat_summary,
        worst_case_scenario: analysisResult.worst_case_scenario,
        recommended_hardening: analysisResult.recommended_hardening || [],
        ai_model: 'google/gemini-2.5-flash',
        ai_prompt_hash: combinedPromptHash,
        ai_response_raw: analysisResult,
        metrics_snapshot: metrics,
      })
      .select()
      .single();

    if (saveError) {
      console.error('Error saving Red Team assessment:', saveError);
    }

    console.log(`[ai-red-team-assessment] Assessment completed. Threat level: ${analysisResult.threat_level}, Red score: ${analysisResult.red_score}`);

    return new Response(
      JSON.stringify({
        success: true,
        assessment_id: savedAssessment?.id,
        prompt_versions: {
          persona: personaPrompt.version,
          template: analysisTemplate.version,
        },
        prompt_hashes: {
          persona: personaPrompt.hash,
          template: analysisTemplate.hash,
        },
        ...analysisResult,
        metrics_snapshot: metrics,
        tokens_used: tokensUsed,
      }),
      { headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    console.error('[ai-red-team-assessment] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
