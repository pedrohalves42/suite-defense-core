/**
 * ai-red-team-assessment — Migrated to serveTenant middleware
 * Modules: types, metrics-collector, deterministic-fallback, assessment-saver
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";
import { callAI, type AIMessage } from "../_shared/ai-provider-helper.ts";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { serveTenant } from '../_shared/serve-tenant.ts';
import { collectMetrics } from './metrics-collector.ts';
import { buildDeterministicAssessment, saveDeterministicAssessment } from './deterministic-fallback.ts';
import { saveAssessment } from './assessment-saver.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, isInternal, userId } = ctx;
  const origin = req.headers.get('origin');

  logger.info(`[ai-red-team-assessment] Starting for tenant ${tenantId}`);

  // Load prompts
  const personaPrompt = await AIPromptRegistry.getPromptWithMetadata('red-team-persona');
  const analysisTemplate = await AIPromptRegistry.getPromptWithMetadata('red-team-analysis-template');
  if (!personaPrompt || !analysisTemplate) {
    return new Response(JSON.stringify({ error: 'Prompt configuration error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
  logPromptUsage('red-team-persona', personaPrompt.hash, tenantId, 'ai-red-team-assessment');
  logPromptUsage('red-team-analysis-template', analysisTemplate.hash, tenantId, 'ai-red-team-assessment');

  // Collect metrics — use service client for both paths since serveTenant provides it
  let metrics: Record<string, unknown>, anaSummary: string;
  try {
    ({ metrics, anaSummary } = await collectMetrics(supabase, tenantId, isInternal, supabase));
  } catch (err: unknown) {
    const e = err as Record<string, unknown>;
    return new Response(JSON.stringify({ error: 'Failed to fetch system metrics', stage: e.stage, details: { code: e.code, message: e.message } }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
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
      const savedAssessment = await saveDeterministicAssessment(supabase, tenantId, deterministicResult, metrics);
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
  } catch (err) {
    logger.warn('[ai-red-team] JSON parse failed', err);
    return new Response(JSON.stringify({ error: 'Failed to parse AI analysis', raw: aiResult.content }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const combinedPromptHash = `${personaPrompt.hash.slice(0, 8)}-${analysisTemplate.hash.slice(0, 8)}`;
  const savedAssessment = await saveAssessment(supabase, tenantId, analysisResult, aiResult.model, combinedPromptHash, metrics);

  logger.info(`[ai-red-team-assessment] Completed. Threat: ${analysisResult.threat_level}, Score: ${analysisResult.red_score}`);

  return {
    success: true, assessment_id: savedAssessment?.id,
    prompt_versions: { persona: personaPrompt.version, template: analysisTemplate.version },
    prompt_hashes: { persona: personaPrompt.hash, template: analysisTemplate.hash },
    ai_provider: aiResult.provider, ai_model: aiResult.model, used_fallback: aiResult.usedFallback,
    ...analysisResult, metrics_snapshot: metrics, tokens_used: aiResult.tokensUsed?.total || 0,
  };
});
