/**
 * ai-system-audit — Modularized
 * Module: dimension-mapper
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";
import { safeParseJSON, createFallbackAudit } from "../_shared/json-parser.ts";
import { callAI, type AIMessage } from "../_shared/ai-provider-helper.ts";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { buildAuditInsertData } from './dimension-mapper.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(JSON.stringify({ error: 'Authorization header required' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const serviceClient = createClient(supabaseUrl, supabaseKey);
    const userClient = createClient(supabaseUrl, supabaseAnonKey, { global: { headers: { Authorization: authHeader } } });

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

    let tenantId = adminRole.tenant_id;
    if (requestedTenantId && userRoles?.some(r => r.tenant_id === requestedTenantId)) {
      tenantId = requestedTenantId;
    }

    logger.info(`[ai-system-audit] Starting audit for tenant ${tenantId}`);

    const personaPrompt = await AIPromptRegistry.getPromptWithMetadata('ana-auditor-persona');
    const analysisTemplate = await AIPromptRegistry.getPromptWithMetadata('ana-analysis-template');
    if (!personaPrompt || !analysisTemplate) {
      return new Response(JSON.stringify({ error: 'Prompt configuration error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    logPromptUsage('ana-auditor-persona', personaPrompt.hash, tenantId, 'ai-system-audit');
    logPromptUsage('ana-analysis-template', analysisTemplate.hash, tenantId, 'ai-system-audit');

    const { data: metrics, error: metricsError } = await userClient.rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });
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
    } catch {
      analysisResult = createFallbackAudit('AI_JSON_PARSE_ERROR');
    }

    const combinedPromptHash = `${personaPrompt.hash.slice(0, 8)}-${analysisTemplate.hash.slice(0, 8)}`;
    const tokensUsed = aiResult.tokensUsed?.total || 0;
    const insertData = buildAuditInsertData(tenantId, user.id, analysisResult, metrics, aiResult.model, combinedPromptHash, tokensUsed);

    const { data: savedAudit, error: saveError } = await serviceClient.from('system_audits').insert(insertData).select().single();
    if (saveError) logger.error('Error saving audit:', saveError);

    logger.info(`[ai-system-audit] Completed. Score: ${analysisResult!.overall_score}`);

    return new Response(JSON.stringify({
      success: true, audit_id: savedAudit?.id,
      prompt_versions: { persona: personaPrompt.version, template: analysisTemplate.version },
      prompt_hashes: { persona: personaPrompt.hash, template: analysisTemplate.hash },
      ai_provider: aiResult.provider, ai_model: aiResult.model, used_fallback: aiResult.usedFallback,
      ...analysisResult, metrics_snapshot: metrics, tokens_used: tokensUsed,
    }), { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch (error) {
    logger.error('[ai-system-audit] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  }
});
