/**
 * ai-insight-dispatcher — Modularized
 * Modules: types, action-guards, mode-handlers
 */
import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { timingSafeEqual } from '../_shared/crypto-utils.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import type { AIInsight } from './types.ts';
import { handleAutoExecute, handleAutoWithApproval } from './mode-handlers.ts';

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
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

    const supabase = createClient(requireEnv('SUPABASE_URL'), serviceRoleKey);
    const body = await req.json();
    const { insight, source = 'api' } = body;

    if (!insight) {
      return new Response(JSON.stringify({ error: 'Missing insight data' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    const insightData = insight as AIInsight;

    if (!insightData.id || !insightData.tenant_id || !insightData.insight_type) {
      return new Response(JSON.stringify({
        error: 'Missing required insight fields', required: ['id', 'tenant_id', 'insight_type'],
        received: { id: insightData.id ? 'present' : 'missing', tenant_id: insightData.tenant_id ? 'present' : 'missing', insight_type: insightData.insight_type ? 'present' : 'missing' },
      }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    logger.info('[ai-insight-dispatcher] Processing insight:', { id: insightData.id, type: insightData.insight_type, severity: insightData.severity, auto_action_mode: insightData.auto_action_mode, source });

    const h = { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' };

    switch (insightData.auto_action_mode) {
      case 'none':
        return new Response(JSON.stringify({ success: true, action: 'none' }), { headers: h });
      case 'suggest':
        return new Response(JSON.stringify({ success: true, action: 'suggested' }), { headers: h });
      case 'auto':
        return await handleAutoExecute(supabase, insightData, req.headers.get('origin'));
      case 'auto_with_approval':
        return await handleAutoWithApproval(supabase, insightData, req.headers.get('origin'));
      default:
        return new Response(JSON.stringify({ success: true, action: 'none' }), { headers: h });
    }
  } catch (error) {
    logger.error('[ai-insight-dispatcher] Error:', error);
    return new Response(JSON.stringify({ error: error instanceof Error ? error.message : 'Unknown error' }), {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
