import { serve } from "https://deno.land/std@0.168.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.74.0";
import { AIPromptRegistry, logPromptUsage } from "../_shared/ai-prompt-registry.ts";
import { safeParseJSON, createFallbackAudit } from "../_shared/json-parser.ts";
import { callAI, type AIMessage } from "../_shared/ai-provider-helper.ts";
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const authHeader = req.headers.get('Authorization');
    if (!authHeader) {
      return new Response(
        JSON.stringify({ error: 'Authorization header required' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;

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
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
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
        { status: 403, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
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
    
    logger.info(`[ai-system-audit] Starting audit for tenant ${tenantId}`);

    // Get prompts from registry (versioned, hashed)
    const personaPrompt = await AIPromptRegistry.getPromptWithMetadata('ana-auditor-persona');
    const analysisTemplate = await AIPromptRegistry.getPromptWithMetadata('ana-analysis-template');

    if (!personaPrompt || !analysisTemplate) {
      logger.error('Failed to load prompts from registry');
      return new Response(
        JSON.stringify({ error: 'Prompt configuration error' }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Log prompt usage for audit trail
    logPromptUsage('ana-auditor-persona', personaPrompt.hash, tenantId, 'ai-system-audit');
    logPromptUsage('ana-analysis-template', analysisTemplate.hash, tenantId, 'ai-system-audit');

    // Get raw metrics using userClient (so auth.uid() works)
    const { data: metrics, error: metricsError } = await userClient
      .rpc('get_audit_raw_metrics', { p_tenant_id: tenantId });

    if (metricsError) {
      logger.error('Error fetching metrics:', metricsError);
      return new Response(
        JSON.stringify({
          error: 'Failed to fetch system metrics',
          stage: 'metrics',
          details: {
            code: metricsError.code ?? 'unknown',
            message: metricsError.message ?? 'unknown error'
          }
        }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info('[ai-system-audit] Metrics collected:', JSON.stringify(metrics));

    // Build analysis prompt with metrics
    const analysisPrompt = analysisTemplate.content.replace('{metrics}', JSON.stringify(metrics, null, 2));

    // Call AI via multi-provider routing
    const messages: AIMessage[] = [
      { role: 'system', content: personaPrompt.content },
      { role: 'user', content: analysisPrompt }
    ];

    const aiResult = await callAI(messages, {
      maxTokens: 8192,
      functionName: 'ai-system-audit',
      tenantId,
    });

    if (!aiResult.success || !aiResult.content) {
      logger.error('AI call failed:', aiResult.error);
      
      // Check for rate limit / credits exhausted patterns in error
      if (aiResult.error?.includes('429') || aiResult.error?.toLowerCase().includes('rate limit')) {
        return new Response(
          JSON.stringify({ error: 'Rate limit exceeded. Please try again later.' }),
          { status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }
      
      if (aiResult.error?.includes('402') || aiResult.error?.toLowerCase().includes('credits')) {
        return new Response(
          JSON.stringify({ error: 'AI credits exhausted. Please add credits to continue.' }),
          { status: 402, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
      }
      
      return new Response(
        JSON.stringify({ error: 'AI analysis failed', details: aiResult.error }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const aiContent = aiResult.content;
    const tokensUsed = aiResult.tokensUsed?.total || 0;

    // Parse AI response with robust stream-safe extraction
    let analysisResult: Record<string, unknown> | null = null;
    let fallbackUsed = false;
    try {
      analysisResult = safeParseJSON(aiContent, 'ai-system-audit');
    } catch (parseError) {
      logger.error('[ai-system-audit] Parse failed, using fallback');
      logger.error('[ai-system-audit] Error:', parseError);
      logger.error('[ai-system-audit] Content length:', aiContent.length);
      
      // Use fallback - pipeline continues with partial result
      analysisResult = createFallbackAudit('AI_JSON_PARSE_ERROR');
      fallbackUsed = true;
    }

    // NOTE: Score floor policy REMOVED - showing real scores for transparency
    // Scores are now displayed exactly as calculated by AI

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
      ai_model: aiResult.model,
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
      logger.error('Error saving audit:', saveError);
      // Return result anyway, just log the save error
    }

    logger.info(`[ai-system-audit] Audit completed. Score: ${analysisResult.overall_score}, Recommendation: ${analysisResult.recommendation}, Provider: ${aiResult.provider}, Fallback: ${aiResult.usedFallback}`);

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
        ai_provider: aiResult.provider,
        ai_model: aiResult.model,
        used_fallback: aiResult.usedFallback,
        ...analysisResult,
        metrics_snapshot: metrics,
        tokens_used: tokensUsed,
      }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );

  } catch (error) {
    logger.error('[ai-system-audit] Error:', error);
    return new Response(
      JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
