import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";

const corsHeaders = {
  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

// Ana persona prompt - expert SaaS auditor
const ANA_SYSTEM_PROMPT = `Você é Ana, uma auditora de sistemas SaaS especializada em explicar tecnologia, segurança e arquitetura de produto para pessoas leigas, executivos e investidores.

Você entende profundamente:
- segurança de endpoints
- compliance e auditoria
- produtos SaaS B2B
- arquitetura de sistemas confiáveis
- risco operacional
- valor de mercado de software

Seu papel NÃO é fazer marketing.
Seu papel NÃO é elogiar.
Seu papel é traduzir a realidade do sistema com base nas métricas fornecidas.

Você receberá métricas reais do sistema CyberShield.
Analise essas métricas e forneça uma avaliação honesta.
Explique tudo sempre em linguagem simples.`;

const ANALYSIS_PROMPT = `Com base nas métricas do sistema CyberShield fornecidas abaixo, realize uma auditoria completa seguindo EXATAMENTE esta estrutura JSON:

MÉTRICAS DO SISTEMA:
{metrics}

Responda APENAS com um JSON válido neste formato exato:
{
  "overall_score": <número 0-100>,
  "dimensions": {
    "system_identity": {
      "score": <número 0-10>,
      "analysis": "<markdown: O que esse sistema realmente é, que problema resolve, para quem foi feito>"
    },
    "control_vs_monitor": {
      "score": <número 0-10>,
      "analysis": "<markdown: O que o sistema controla vs apenas monitora, avisar vs garantir>"
    },
    "evidence_proof": {
      "score": <número 0-10>,
      "analysis": "<markdown: Como o sistema prova o que fez, se registros são confiáveis para auditoria>"
    },
    "maturity": {
      "score": <número 0-10>,
      "analysis": "<markdown: O que já está maduro e funciona bem, funcionalidades estáveis>"
    },
    "failure_handling": {
      "score": <número 0-10>,
      "analysis": "<markdown: Como sistema se comporta quando algo dá errado, recuperação>"
    },
    "limitations": {
      "score": <número 0-10>,
      "analysis": "<markdown: Limitações atuais sem drama, o que não está finalizado>"
    },
    "operational_trust": {
      "score": <número 0-10>,
      "analysis": "<markdown: Nível de confiança operacional, você confiaria esse sistema rodando?>"
    },
    "market_value": {
      "score": <número 0-10>,
      "analysis": "<markdown: Percepção de valor de mercado, MRR, churn, diferenciação>"
    },
    "simplicity": {
      "score": <número 0-10>,
      "analysis": "<markdown: Teste do leigo, clareza para usuários não-técnicos>"
    }
  },
  "executive_summary": "<markdown: Resumo executivo de 2-3 parágrafos para investidor ou CEO>",
  "final_sentence": "<Uma frase simples que qualquer pessoa entenda sobre o CyberShield>",
  "recommendation": "<NOT_READY | READY_MVP | READY_FOR_SCALE | ENTERPRISE_READY>"
}

IMPORTANTE:
- Use APENAS os dados fornecidos nas métricas
- Seja honesto e direto, sem marketing
- Scores devem refletir a realidade das métricas
- overall_score deve ser coerente com a média ponderada das dimensões
- Responda APENAS com o JSON, sem texto adicional`;

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
    console.log(`[ai-system-audit] Starting audit for tenant ${tenantId}`);

    // Get raw metrics using the RPC function
    const { data: metrics, error: metricsError } = await supabase
      .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });

    if (metricsError) {
      console.error('Error fetching metrics:', metricsError);
      return new Response(
        JSON.stringify({ error: 'Failed to fetch system metrics' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    console.log('[ai-system-audit] Metrics collected:', JSON.stringify(metrics));

    // Call Lovable AI for analysis
    const analysisPrompt = ANALYSIS_PROMPT.replace('{metrics}', JSON.stringify(metrics, null, 2));

    const aiResponse = await fetch('https://ai.gateway.lovable.dev/v1/chat/completions', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${lovableApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'google/gemini-2.5-flash',
        messages: [
          { role: 'system', content: ANA_SYSTEM_PROMPT },
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
      // Remove markdown code blocks if present
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

    // Calculate prompt hash for reproducibility
    const encoder = new TextEncoder();
    const data = encoder.encode(ANA_SYSTEM_PROMPT + analysisPrompt);
    const hashBuffer = await crypto.subtle.digest('SHA-256', data);
    const hashArray = Array.from(new Uint8Array(hashBuffer));
    const promptHash = hashArray.map(b => b.toString(16).padStart(2, '0')).join('').slice(0, 16);

    // Save audit result to database
    const { data: savedAudit, error: saveError } = await supabase
      .from('system_audits')
      .insert({
        tenant_id: tenantId,
        created_by: user.id,
        overall_score: analysisResult.overall_score,
        score_system_identity: analysisResult.dimensions.system_identity.score,
        score_control_vs_monitor: analysisResult.dimensions.control_vs_monitor.score,
        score_evidence_proof: analysisResult.dimensions.evidence_proof.score,
        score_maturity: analysisResult.dimensions.maturity.score,
        score_failure_handling: analysisResult.dimensions.failure_handling.score,
        score_limitations: analysisResult.dimensions.limitations.score,
        score_operational_trust: analysisResult.dimensions.operational_trust.score,
        score_market_value: analysisResult.dimensions.market_value.score,
        score_simplicity: analysisResult.dimensions.simplicity.score,
        analysis_system_identity: analysisResult.dimensions.system_identity.analysis,
        analysis_control_vs_monitor: analysisResult.dimensions.control_vs_monitor.analysis,
        analysis_evidence_proof: analysisResult.dimensions.evidence_proof.analysis,
        analysis_maturity: analysisResult.dimensions.maturity.analysis,
        analysis_failure_handling: analysisResult.dimensions.failure_handling.analysis,
        analysis_limitations: analysisResult.dimensions.limitations.analysis,
        analysis_operational_trust: analysisResult.dimensions.operational_trust.analysis,
        analysis_market_value: analysisResult.dimensions.market_value.analysis,
        analysis_simplicity: analysisResult.dimensions.simplicity.analysis,
        executive_summary: analysisResult.executive_summary,
        final_sentence: analysisResult.final_sentence,
        recommendation: analysisResult.recommendation,
        metrics_snapshot: metrics,
        ai_model: 'google/gemini-2.5-flash',
        prompt_hash: promptHash,
        tokens_used: tokensUsed,
      })
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
