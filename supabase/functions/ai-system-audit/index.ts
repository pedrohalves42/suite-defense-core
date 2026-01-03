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
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const lovableApiKey = Deno.env.get('LOVABLE_API_KEY');

    if (!lovableApiKey) {
      console.error('LOVABLE_API_KEY not configured');
      return new Response(
        JSON.stringify({ error: 'AI service not configured' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Service client for admin operations
    const serviceClient = createClient(supabaseUrl, supabaseKey);
    
    // User client for RPC calls that depend on auth.uid()
    const userClient = createClient(supabaseUrl, supabaseAnonKey, {
      global: {
        headers: {
          Authorization: authHeader,
        },
      },
    });

    // Get user from token
    const token = authHeader.replace('Bearer ', '');
    const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);
    
    if (userError || !user) {
      return new Response(
        JSON.stringify({ error: 'Invalid token' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Get user's tenant - prefer x-tenant-id header
    const requestedTenantId = req.headers.get('x-tenant-id');
    
    // Get all user roles (avoid .single() for multi-role users)
    const { data: userRoles } = await serviceClient
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

    // Use requested tenant if user has access
    let tenantId = adminRole.tenant_id;
    if (requestedTenantId) {
      const hasAccess = userRoles?.some(r => r.tenant_id === requestedTenantId);
      if (hasAccess) {
        tenantId = requestedTenantId;
      }
    }
    
    console.log(`[ai-system-audit] Starting audit for tenant ${tenantId}`);

    // Get prompts from registry (versioned, hashed)
    const personaPrompt = await AIPromptRegistry.getPromptWithMetadata('ana-auditor-persona');
    const analysisTemplate = await AIPromptRegistry.getPromptWithMetadata('ana-analysis-template');

    if (!personaPrompt || !analysisTemplate) {
      console.error('Failed to load prompts from registry');
      return new Response(
        JSON.stringify({ error: 'Prompt configuration error' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    // Log prompt usage for audit trail
    logPromptUsage('ana-auditor-persona', personaPrompt.hash, tenantId, 'ai-system-audit');
    logPromptUsage('ana-analysis-template', analysisTemplate.hash, tenantId, 'ai-system-audit');

    // Get raw metrics using userClient (so auth.uid() works)
    const { data: metrics, error: metricsError } = await userClient
      .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });

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

    console.log('[ai-system-audit] Metrics collected:', JSON.stringify(metrics));

    // Build analysis prompt with metrics
    const analysisPrompt = analysisTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2));

    // Call Lovable AI for analysis
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

    // Parse AI response (handle markdown code blocks)
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

    // Create combined prompt hash for reproducibility
    const combinedPromptHash = `${personaPrompt.hash.slice(0, 8)}-${analysisTemplate.hash.slice(0, 8)}`;

    // Map new dimension names to old column names for backward compatibility
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

    // Build insert object dynamically
    const insertData: Record<string, any> = {
      tenant_id: tenantId,
      created_by: user.id,
      overall_score: analysisResult.overall_score,
      executive_summary: analysisResult.executive_summary,
      final_sentence: analysisResult.final_sentence,
      recommendation: analysisResult.recommendation,
      metrics_snapshot: metrics,
      ai_model: 'google/gemini-2.5-flash',
      prompt_hash: combinedPromptHash,
      tokens_used: tokensUsed,
      evidence_basis: analysisResult.evidence_basis || [],
      falsification_criteria: analysisResult.falsification_criteria || [],
    };

    // Map dimension scores and analyses
    for (const [dimKey, mapping] of Object.entries(dimensionMapping)) {
      const dim = analysisResult.dimensions?.[dimKey];
      if (dim) {
        insertData[mapping.scoreCol] = dim.score;
        insertData[mapping.analysisCol] = dim.analysis;
      }
    }

    // Save audit result to database using serviceClient
    const { data: savedAudit, error: saveError } = await serviceClient
      .from('system_audits')
      .insert(insertData)
      .select()
      .single();

    if (saveError) {
      console.error('Error saving audit:', saveError);
      // Return result anyway, just log the save error
    }

    console.log(`[ai-system-audit] Audit completed. Score: ${analysisResult.overall_score}, Recommendation: ${analysisResult.recommendation}`);

    return new Response(
      JSON.stringify({
        success: true,
        audit_id: savedAudit?.id,
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
    console.error('[ai-system-audit] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
    );
  }
});
