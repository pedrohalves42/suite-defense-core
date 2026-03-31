/**
 * ai-red-team-assessment — Modularized
 * Modules: types, metrics-collector, deterministic-fallback, assessment-saver
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";
import { callAI, type AIMessage } from "../_shared/ai-provider-helper.ts";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { collectMetrics } from './metrics-collector.ts';
import { buildDeterministicAssessment, saveDeterministicAssessment } from './deterministic-fallback.ts';
import { saveAssessment } from './assessment-saver.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseKey);

    const internalSecret = req.headers.get('X-Internal-Secret');
    const INTERNAL_FUNCTION_SECRET = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');

    let tenantId: string | null = null;
    let userClient = serviceClient;
    let isInternalCall = false;

    if (internalSecret && INTERNAL_FUNCTION_SECRET && internalSecret === INTERNAL_FUNCTION_SECRET) {
      isInternalCall = true;
      try { const body = await req.clone().json(); tenantId = body.tenant_id; } catch {
        const url = new URL(req.url); tenantId = url.searchParams.get('tenant_id');
      }
      if (!tenantId) {
        const { data: tenants } = await serviceClient.from('tenants').select('id').limit(1);
        tenantId = tenants?.[0]?.id;
      }
    } else if (authHeader) {
      userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });
      const token = authHeader.replace('Bearer ', '');
      const { data: { user }, error: userError } = await serviceClient.auth.getUser(token);
      if (userError || !user) {
        return new Response(JSON.stringify({ error: 'Invalid token' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
      const requestedTenantId = req.headers.get('x-tenant-id');
      const { data: userRoles } = await serviceClient.from('user_roles').select('tenant_id, role').eq('user_id', user.id);
      const adminRole = userRoles?.find(r => ['admin', 'super_admin'].includes(r.role));
      if (!adminRole) {
        return new Response(JSON.stringify({ error: 'Admin access required' }), { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
      tenantId = adminRole.tenant_id;
      if (requestedTenantId && userRoles?.some(r => r.tenant_id === requestedTenantId)) {
        tenantId = requestedTenantId;
      }
    } else {
      return new Response(JSON.stringify({ error: 'Authorization required' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    if (!tenantId) {
      return new Response(JSON.stringify({ error: 'Tenant ID not found' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    logger.info(`[ai-red-team-assessment] Starting for tenant ${tenantId}`);

    // Load prompts
    const personaPrompt = await AIPromptRegistry.getPromptWithMetadata('red-team-persona');
    const analysisTemplate = await AIPromptRegistry.getPromptWithMetadata('red-team-analysis-template');
    if (!personaPrompt || !analysisTemplate) {
      return new Response(JSON.stringify({ error: 'Prompt configuration error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    logPromptUsage('red-team-persona', personaPrompt.hash, tenantId, 'ai-red-team-assessment');
    logPromptUsage('red-team-analysis-template', analysisTemplate.hash, tenantId, 'ai-red-team-assessment');

    // Collect metrics
    let metrics: any, anaSummary: string;
    try {
      ({ metrics, anaSummary } = await collectMetrics(serviceClient, tenantId, isInternalCall, userClient));
    } catch (err: any) {
      return new Response(JSON.stringify({ error: 'Failed to fetch system metrics', stage: err.stage, details: { code: err.code, message: err.message } }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // Call AI
    const analysisPrompt = analysisTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2)).replace('{ana_summary}', anaSummary);
    const messages: AIMessage[] = [
      { role: 'system', content: personaPrompt.content },
      { role: 'user', content: analysisPrompt },
    ];
    const aiResult = await callAI(messages, { maxTokens: 8192, functionName: 'ai-red-team-assessment', tenantId });

    if (!aiResult.success || !aiResult.content) {
      if (aiResult.error?.includes('429') || aiResult.error?.toLowerCase().includes('rate limit')) {
        return new Response(JSON.stringify({ error: 'Rate limit exceeded.', retry_after: 60 }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
      if (aiResult.error?.includes('402') || aiResult.error?.toLowerCase().includes('credits') || aiResult.error?.includes('All AI providers failed')) {
        const deterministicResult = buildDeterministicAssessment(metrics);
        const savedAssessment = await saveDeterministicAssessment(serviceClient, tenantId, deterministicResult, metrics);
        return new Response(JSON.stringify({
          success: true, assessment_id: savedAssessment?.id,
          prompt_versions: { persona: 'deterministic', template: 'fallback' },
          prompt_hashes: { persona: 'n/a', template: 'n/a' },
          ...deterministicResult, metrics_snapshot: metrics, tokens_used: 0,
          warning: 'AI providers unavailable. This is a deterministic fallback assessment.',
        }), { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      }
      return new Response(JSON.stringify({ error: 'AI analysis failed', details: aiResult.error }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // Parse AI response
    let analysisResult;
    try {
      let jsonContent = aiResult.content;
      if (jsonContent.includes('```json')) jsonContent = jsonContent.replace(/```json\n?/g, '').replace(/```\n?/g, '');
      else if (jsonContent.includes('```')) jsonContent = jsonContent.replace(/```\n?/g, '');
      analysisResult = JSON.parse(jsonContent.trim());
    } catch {
      return new Response(JSON.stringify({ error: 'Failed to parse AI analysis', raw: aiResult.content }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const combinedPromptHash = `${personaPrompt.hash.slice(0, 8)}-${analysisTemplate.hash.slice(0, 8)}`;
    const savedAssessment = await saveAssessment(serviceClient, tenantId, analysisResult, aiResult.model, combinedPromptHash, metrics);

    logger.info(`[ai-red-team-assessment] Completed. Threat: ${analysisResult.threat_level}, Score: ${analysisResult.red_score}`);

    return new Response(JSON.stringify({
      success: true, assessment_id: savedAssessment?.id,
      prompt_versions: { persona: personaPrompt.version, template: analysisTemplate.version },
      prompt_hashes: { persona: personaPrompt.hash, template: analysisTemplate.hash },
      ai_provider: aiResult.provider, ai_model: aiResult.model, used_fallback: aiResult.usedFallback,
      ...analysisResult, metrics_snapshot: metrics, tokens_used: aiResult.tokensUsed?.total || 0,
    }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });

  } catch (error) {
    logger.error('[ai-red-team-assessment] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
