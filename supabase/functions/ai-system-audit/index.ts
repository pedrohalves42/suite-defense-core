/**
 * ai-system-audit — Migrated to serveTenant middleware
 * Module: dimension-mapper
 */
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";
import { safeParseJSON, createFallbackAudit } from "../_shared/json-parser.ts";
import { callAI, type AIMessage } from "../_shared/ai-provider-helper.ts";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { serveTenant } from '../_shared/serve-tenant.ts';
import { buildAuditInsertData } from './dimension-mapper.ts';

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId } = ctx;
  const origin = req.headers.get('origin');

  logger.info(`[ai-system-audit] Starting audit for tenant ${tenantId}`);

  const personaPrompt = await AIPromptRegistry.getPromptWithMetadata('ana-auditor-persona');
  const analysisTemplate = await AIPromptRegistry.getPromptWithMetadata('ana-analysis-template');
  if (!personaPrompt || !analysisTemplate) {
    return new Response(JSON.stringify({ error: 'Prompt configuration error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
  logPromptUsage('ana-auditor-persona', personaPrompt.hash, tenantId, 'ai-system-audit');
  logPromptUsage('ana-analysis-template', analysisTemplate.hash, tenantId, 'ai-system-audit');

  const { data: metrics, error: metricsError } = await supabase.rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });
  if (metricsError) {
    return new Response(JSON.stringify({ error: 'Failed to fetch system metrics', stage: 'metrics', details: { code: metricsError.code ?? 'unknown', message: metricsError.message ?? 'unknown error' } }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  const analysisPrompt = analysisTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2));
  const messages: AIMessage[] = [{ role: 'system', content: personaPrompt.content }, { role: 'user', content: analysisPrompt }];
  const aiResult = await callAI(messages, { maxTokens: 8192, functionName: 'ai-system-audit', tenantId });

  if (!aiResult.success || !aiResult.content) {
    if (aiResult.error?.includes('429') || aiResult.error?.toLowerCase().includes('rate limit')) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded.' }), { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    if (aiResult.error?.includes('402') || aiResult.error?.toLowerCase().includes('credits')) {
      return new Response(JSON.stringify({ error: 'AI credits exhausted.' }), { status: 402, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    return new Response(JSON.stringify({ error: 'AI analysis failed', details: aiResult.error }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }

  let analysisResult: Record<string, unknown> | null = null;
  try {
    analysisResult = safeParseJSON(aiResult.content, 'ai-system-audit');
  } catch (err) {
    logger.warn('[ai-system-audit] JSON parse failed, using fallback', err);
    analysisResult = createFallbackAudit('AI_JSON_PARSE_ERROR');
  }

  const combinedPromptHash = `${personaPrompt.hash.slice(0, 8)}-${analysisTemplate.hash.slice(0, 8)}`;
  const tokensUsed = aiResult.tokensUsed?.total || 0;
  const insertData = buildAuditInsertData(tenantId, userId || 'system', analysisResult, metrics, aiResult.model, combinedPromptHash, tokensUsed);

  const { data: savedAudit, error: saveError } = await supabase.from('system_audits').insert(insertData).select().single();
  if (saveError) logger.error('Error saving audit:', saveError);

  logger.info(`[ai-system-audit] Completed. Score: ${analysisResult!.overall_score}`);

  return {
    success: true, audit_id: savedAudit?.id,
    prompt_versions: { persona: personaPrompt.version, template: analysisTemplate.version },
    prompt_hashes: { persona: personaPrompt.hash, template: analysisTemplate.hash },
    ai_provider: aiResult.provider, ai_model: aiResult.model, used_fallback: aiResult.usedFallback,
    ...analysisResult, metrics_snapshot: metrics, tokens_used: tokensUsed,
  };
});
