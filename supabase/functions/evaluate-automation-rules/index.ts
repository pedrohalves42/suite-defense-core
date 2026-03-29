/**
 * evaluate-automation-rules — Enterprise Engine v2
 * Modularized: helpers, protection pipeline, trigger evaluators, action executors
 * 
 * NOTE: This function keeps Deno.serve() because it has a complex auth model
 * (service_role for cron + JWT for admin + per-tenant evaluation).
 * The internal logic is decomposed into modules for maintainability.
 */
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.39.3";
import { corsSecurityHeaders, secureJsonResponse, secureErrorResponse, secureCorsPreflightResponse } from '../_shared/security-headers.ts';
import { logger } from '../_shared/logger.ts';

import { evaluateForTenant } from './tenant-evaluator.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return secureCorsPreflightResponse();
  }

  try {
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Auth check
    const authHeader = req.headers.get('authorization');
    let tenantId: string | null = null;
    let isServiceRole = false;

    if (authHeader) {
      const token = authHeader.replace('Bearer ', '');
      if (token === supabaseServiceKey) {
        isServiceRole = true;
      } else {
        try {
          const payload = JSON.parse(atob(token.split('.')[1]));
          if (payload.role === 'service_role') isServiceRole = true;
        } catch (e) { logger.warn('[evaluate-automation-rules] JWT parse failed:', e); }

        if (!isServiceRole) {
          const { data: { user }, error: authError } = await supabase.auth.getUser(token);
          if (authError || !user) return secureErrorResponse('Unauthorized', 401);

          const { data: roleData } = await supabase
            .from('user_roles')
            .select('tenant_id, role')
            .eq('user_id', user.id)
            .in('role', ['admin', 'super_admin'])
            .limit(1)
            .maybeSingle();

          if (!roleData) return secureErrorResponse('Admin access required', 403);
          tenantId = roleData.tenant_id;
        }
      }
    }

    const body = req.method === 'POST' ? await req.json() : {};
    tenantId = tenantId || body.tenant_id;

    // Auto-discover tenants for cron (service_role)
    if (!tenantId && isServiceRole) {
      const { data: tenants } = await supabase.from('tenants').select('id').limit(50);

      if (!tenants || tenants.length === 0) {
        return secureJsonResponse({ message: 'No tenants found' });
      }

      let totalEvaluated = 0, totalTriggered = 0, totalBlocked = 0, totalDecisions = 0;
      const riskScores: Record<string, number> = {};

      for (const t of tenants) {
        const result = await evaluateForTenant(supabase, t.id);
        totalEvaluated += result.evaluated;
        totalTriggered += result.triggered;
        totalBlocked += result.blocked;
        totalDecisions += result.decisions;
        if (result.risk_score != null) riskScores[t.id] = result.risk_score;
      }

      if (req.headers.get('x-cron-source') === 'true') {
        try {
          await supabase.rpc('update_cron_health', {
            p_cron_name: 'evaluate-automation-rules-5min',
            p_success: true,
            p_details: { tenants: tenants.length, evaluated: totalEvaluated, triggered: totalTriggered, blocked: totalBlocked, decisions: totalDecisions },
          });
        } catch (e) { logger.warn('[evaluate-automation-rules] Failed to update cron health:', e); }
      }

      logger.info(`[Enterprise Engine v2] ${tenants.length} tenants | ${totalEvaluated} rules | ${totalTriggered} triggered | ${totalBlocked} blocked | ${totalDecisions} decisions`);

      return secureJsonResponse({
        tenants_processed: tenants.length,
        evaluated: totalEvaluated,
        triggered: totalTriggered,
        blocked: totalBlocked,
        decisions: totalDecisions,
        risk_scores: riskScores,
      });
    }

    if (!tenantId) return secureErrorResponse('tenant_id required', 400);

    const result = await evaluateForTenant(supabase, tenantId);

    if (req.headers.get('x-cron-source') === 'true') {
      try {
        await supabase.rpc('update_cron_health', {
          p_cron_name: 'evaluate-automation-rules-5min',
          p_success: true,
          p_details: result,
        });
      } catch (e) { logger.warn('[evaluate-automation-rules] cron health update failed:', e); }
    }

    logger.info(`[Enterprise Engine v2] tenant=${tenantId} | ${result.evaluated} rules | ${result.triggered} triggered | ${result.blocked} blocked | ${result.decisions} decisions | risk=${result.risk_score ?? 'n/a'}`);

    return secureJsonResponse(result);

  } catch (error) {
    logger.error('Error in evaluate-automation-rules:', error);
    return secureErrorResponse(
      error instanceof Error ? error.message : 'Unknown error',
      500
    );
  }
});
