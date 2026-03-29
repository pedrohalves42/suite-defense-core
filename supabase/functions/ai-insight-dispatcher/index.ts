import { requireEnv } from '../_shared/env.ts';
import { serve } from 'https://deno.land/std@0.168.0/http/server.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { timingSafeEqual } from '../_shared/crypto-utils.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
};

interface AIInsight {
  id: string;
  tenant_id: string;
  agent_id: string | null;
  insight_type: string;
  severity: string;
  title: string;
  description: string;
  evidence: Record<string, unknown>;
  recommendation: string;
  confidence_score: number;
  auto_action_mode: 'none' | 'suggest' | 'auto' | 'auto_with_approval';
  category: string | null;
  recommended_actions: Record<string, unknown>[];
}

// Low-risk action types that can be auto-executed
const LOW_RISK_ACTIONS = [
  'notify',
  'generate_report',
  'log_event',
  'update_status',
  'send_alert',
];

// Rate limit: max auto-executions per day per tenant
const MAX_AUTO_EXECUTIONS_PER_DAY = 100;

async function checkAutoExecutionRateLimit(
  supabase: any,
  tenantId: string
): Promise<boolean> {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  const { count, error } = await supabase
    .from('ai_action_executions')
    .select('id', { count: 'exact', head: true })
    .eq('tenant_id', tenantId)
    .eq('execution_status', 'executed')
    .gte('executed_at', today.toISOString());

  if (error) {
    logger.error('[ai-insight-dispatcher] Rate limit check error:', error);
    return false;
  }

  return (count || 0) < MAX_AUTO_EXECUTIONS_PER_DAY;
}

async function isActionWhitelisted(
  supabase: any,
  actionType: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from('ai_action_configs')
    .select('is_enabled')
    .eq('action_type', actionType)
    .eq('is_enabled', true)
    .maybeSingle();

  if (error) {
    logger.error('[ai-insight-dispatcher] Whitelist check error:', error);
    return false;
  }

  return !!data;
}

function isLowRiskAction(actionType: string): boolean {
  return LOW_RISK_ACTIONS.includes(actionType);
}

serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    // V-1101: Require internal auth for internal dispatcher function
    const internalSecret = req.headers.get('X-Internal-Secret') || req.headers.get('x-internal-secret');
    const expectedSecret = Deno.env.get('INTERNAL_FUNCTION_SECRET');
    const authHeader = req.headers.get('Authorization');
    const serviceRoleKey = requireEnv('SUPABASE_SERVICE_ROLE_KEY');
    
    const isInternal = (internalSecret && expectedSecret && await timingSafeEqual(internalSecret, expectedSecret)) ||
                       (authHeader && await timingSafeEqual(authHeader, `Bearer ${serviceRoleKey}`));
    
    if (!isInternal) {
      return new Response(JSON.stringify({ error: 'Unauthorized: internal access only' }), {
        status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const supabaseUrl = requireEnv('SUPABASE_URL');
    const supabase = createClient(supabaseUrl, serviceRoleKey);

    const body = await req.json();
    const { insight, source = 'api' } = body;

    if (!insight) {
      return new Response(
        JSON.stringify({ error: 'Missing insight data' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const insightData = insight as AIInsight;
    
    // PHASE 4: Validate required fields to prevent 400 errors
    if (!insightData.id || !insightData.tenant_id || !insightData.insight_type) {
      logger.warn('[ai-insight-dispatcher] Missing required fields:', {
        hasId: !!insightData.id,
        hasTenantId: !!insightData.tenant_id,
        hasInsightType: !!insightData.insight_type,
      });
      return new Response(
        JSON.stringify({ 
          error: 'Missing required insight fields',
          required: ['id', 'tenant_id', 'insight_type'],
          received: {
            id: insightData.id ? 'present' : 'missing',
            tenant_id: insightData.tenant_id ? 'present' : 'missing',
            insight_type: insightData.insight_type ? 'present' : 'missing',
          }
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }
    
    logger.info('[ai-insight-dispatcher] Processing insight:', {
      id: insightData.id,
      type: insightData.insight_type,
      severity: insightData.severity,
      auto_action_mode: insightData.auto_action_mode,
      source,
    });

    // Based on auto_action_mode, decide what to do
    switch (insightData.auto_action_mode) {
      case 'none':
        // Just log it, no action needed
        logger.info('[ai-insight-dispatcher] Mode=none, skipping action');
        return new Response(
          JSON.stringify({ success: true, action: 'none' }),
          { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );

      case 'suggest':
        // Insight is already in the Action Center via v_action_center view
        logger.info('[ai-insight-dispatcher] Mode=suggest, insight visible in Action Center');
        return new Response(
          JSON.stringify({ success: true, action: 'suggested' }),
          { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );

      case 'auto':
        // Try to auto-execute if safe
        const recommendedActions = insightData.recommended_actions || [];
        const firstAction = recommendedActions[0] as { action_type?: string } | undefined;
        const actionType = firstAction?.action_type || 'unknown';

        // Check if low-risk and whitelisted
        const isLowRisk = isLowRiskAction(actionType);
        const isWhitelisted = await isActionWhitelisted(supabase, actionType);
        const withinRateLimit = await checkAutoExecutionRateLimit(supabase, insightData.tenant_id);

        logger.info('[ai-insight-dispatcher] Auto-execute checks:', {
          actionType,
          isLowRisk,
          isWhitelisted,
          withinRateLimit,
        });

        if (isLowRisk && isWhitelisted && withinRateLimit) {
          // Execute the action
          try {
            const { data: execResult, error: execError } = await supabase.functions.invoke(
              'ai-action-executor',
              {
                body: {
                  insight_id: insightData.id,
                  tenant_id: insightData.tenant_id,
                  action_type: actionType,
                  context: {
                    agent_id: insightData.agent_id,
                    insight_type: insightData.insight_type,
                    evidence: insightData.evidence,
                    auto_executed: true,
                  },
                },
              }
            );

            if (execError) {
              logger.error('[ai-insight-dispatcher] Auto-execute error:', execError);
              // Fall back to manual approval
              break;
            }

            // Mark insight as auto-executed
            const { error: updateError } = await supabase
              .from('ai_insights')
              .update({
                auto_action_executed: true,
                auto_action_executed_at: new Date().toISOString(),
              })
              .eq('id', insightData.id);

            if (updateError) {
              logger.error('[ai-insight-dispatcher] Update error:', updateError);
            }

            logger.info('[ai-insight-dispatcher] Auto-executed successfully:', execResult);

            return new Response(
              JSON.stringify({ success: true, action: 'auto_executed', result: execResult }),
              { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
            );
          } catch (execErr) {
            logger.error('[ai-insight-dispatcher] Execution exception:', execErr);
          }
        }

        // If can't auto-execute, fall through to suggest
        logger.info('[ai-insight-dispatcher] Cannot auto-execute, suggesting instead');
        return new Response(
          JSON.stringify({ 
            success: true, 
            action: 'suggested',
            reason: !isLowRisk ? 'high_risk_action' : !isWhitelisted ? 'not_whitelisted' : 'rate_limited',
          }),
          { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );

      case 'auto_with_approval':
        // Create a pending playbook execution for approval
        logger.info('[ai-insight-dispatcher] Creating pending playbook for approval');

        // Find or create a playbook for this insight type
        const { data: playbook, error: playbookError } = await supabase
          .from('playbooks')
          .select('id')
          .eq('tenant_id', insightData.tenant_id)
          .eq('trigger_type', insightData.insight_type)
          .eq('is_enabled', true)
          .maybeSingle();

        if (playbookError) {
          logger.error('[ai-insight-dispatcher] Playbook lookup error:', playbookError);
        }

        if (playbook) {
          // Create pending execution
          const { error: execCreateError } = await supabase
            .from('playbook_executions')
            .insert({
              tenant_id: insightData.tenant_id,
              playbook_id: playbook.id,
              agent_id: insightData.agent_id,
              status: 'pending',
              trigger_source: 'ai_insight',
              trigger_context: {
                insight_id: insightData.id,
                insight_type: insightData.insight_type,
                severity: insightData.severity,
                evidence: insightData.evidence,
                recommendation: insightData.recommendation,
              },
              risk_score: Math.round(insightData.confidence_score * 100),
            });

          if (execCreateError) {
            logger.error('[ai-insight-dispatcher] Create execution error:', execCreateError);
          } else {
            logger.info('[ai-insight-dispatcher] Pending execution created');
          }
        }

        return new Response(
          JSON.stringify({ 
            success: true, 
            action: 'pending_approval',
            playbook_found: !!playbook,
          }),
          { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );

      default:
        logger.info('[ai-insight-dispatcher] Unknown mode:', insightData.auto_action_mode);
        return new Response(
          JSON.stringify({ success: true, action: 'none' }),
          { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        );
    }

    // Fallback response (should not reach here)
    return new Response(
      JSON.stringify({ success: true, action: 'processed' }),
      { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  } catch (error) {
    logger.error('[ai-insight-dispatcher] Error:', error);
    const message = error instanceof Error ? error.message : 'Unknown error';
    return new Response(
      JSON.stringify({ error: message }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
