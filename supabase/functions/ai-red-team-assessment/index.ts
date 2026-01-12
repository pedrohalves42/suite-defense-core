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

    // Check for internal call via X-Internal-Secret (ADR-023)
    const internalSecret = req.headers.get('X-Internal-Secret');
    const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    
    let tenantId: string | null = null;
    let userClient = serviceClient; // Default to service client for internal calls
    let isInternalCall = false;

    if (internalSecret && INTERNAL_FUNCTION_SECRET && internalSecret === INTERNAL_FUNCTION_SECRET) {
      // Internal call - use service role, get tenant_id from body
      isInternalCall = true;
      console.log('[ai-red-team-assessment] Internal call detected');
      
      try {
        const body = await req.clone().json();
        tenantId = body.tenant_id;
      } catch {
        // Try query param
        const url = new URL(req.url);
        tenantId = url.searchParams.get('tenant_id');
      }
      
      if (!tenantId) {
        // Get first tenant
        const { data: tenants } = await serviceClient.from('tenants').select('id').limit(1);
        tenantId = tenants?.[0]?.id;
      }
      
      console.log('[ai-red-team-assessment] Internal call for tenant:', tenantId);
    } else if (authHeader) {
      // User call - validate token and get tenant from roles
      userClient = createClient(supabaseUrl, supabaseAnonKey, {
        global: { headers: { Authorization: authHeader } },
      });

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

      // Get all user roles
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

      tenantId = adminRole.tenant_id;
      if (requestedTenantId) {
        const hasAccess = userRoles?.some(r => r.tenant_id === requestedTenantId);
        if (hasAccess) {
          tenantId = requestedTenantId;
        }
      }
    } else {
      return new Response(
        JSON.stringify({ error: 'Authorization required' }),
        { status: 401, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
    if (!tenantId) {
      return new Response(
        JSON.stringify({ error: 'Tenant ID not found' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }
    
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

    // Get raw metrics using serviceClient for internal calls or userClient for user calls
    const metricsClient = isInternalCall ? serviceClient : userClient;
    const { data: metrics, error: metricsError } = await metricsClient
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

    // Get ana_summary from latest audit
    let anaSummary = '';
    const { data: latestAudit } = await serviceClient
      .from('system_audits')
      .select('executive_summary, recommendation, overall_score')
      .eq('tenant_id', tenantId)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (latestAudit) {
      anaSummary = `Score: ${latestAudit.overall_score}/100. Recommendation: ${latestAudit.recommendation}. Summary: ${latestAudit.executive_summary}`;
    } else {
      anaSummary = 'Nenhuma auditoria anterior disponível.';
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

    // Save Red Team assessment to database using serviceClient
    const { data: savedAssessment, error: saveError } = await serviceClient
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
