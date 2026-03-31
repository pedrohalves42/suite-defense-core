/**
 * ai-insight-dispatcher — Migrated to serveInternal
 * Modules: types, action-guards, mode-handlers
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import type { AIInsight } from './types.ts';
import { handleAutoExecute, handleAutoWithApproval } from './mode-handlers.ts';

serveInternal(async (req, ctx) => {
  const { supabase, body } = ctx;
  const { insight, source = 'api' } = body as Record<string, unknown>;

  if (!insight) {
    return new Response(JSON.stringify({ error: 'Missing insight data' }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const insightData = insight as AIInsight;

  if (!insightData.id || !insightData.tenant_id || !insightData.insight_type) {
    return new Response(JSON.stringify({
      error: 'Missing required insight fields', required: ['id', 'tenant_id', 'insight_type'],
      received: { id: insightData.id ? 'present' : 'missing', tenant_id: insightData.tenant_id ? 'present' : 'missing', insight_type: insightData.insight_type ? 'present' : 'missing' },
    }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  logger.info('[ai-insight-dispatcher] Processing insight:', { id: insightData.id, type: insightData.insight_type, severity: insightData.severity, auto_action_mode: insightData.auto_action_mode, source });

  switch (insightData.auto_action_mode) {
    case 'none':
      return { success: true, action: 'none' };
    case 'suggest':
      return { success: true, action: 'suggested' };
    case 'auto':
      return await handleAutoExecute(supabase, insightData, req.headers.get('origin'));
    case 'auto_with_approval':
      return await handleAutoWithApproval(supabase, insightData, req.headers.get('origin'));
    default:
      return { success: true, action: 'none' };
  }
});
