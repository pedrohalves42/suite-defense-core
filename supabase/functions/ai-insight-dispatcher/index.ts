/**
 * ai-insight-dispatcher — Migrated to serveInternal
 * Modules: types, action-guards, mode-handlers
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { AIInsight } from './types.ts';
import { handleAutoExecute, handleAutoWithApproval } from './mode-handlers.ts';

const InsightSchema = z.object({
  id: z.string().min(1),
  tenant_id: z.string().uuid(),
  insight_type: z.string().min(1).max(100),
  severity: z.string().max(50).optional(),
  auto_action_mode: z.enum(['none', 'suggest', 'auto', 'auto_with_approval']).optional(),
  recommended_actions: z.array(z.unknown()).optional(),
}).passthrough();

const DispatcherSchema = z.object({
  insight: InsightSchema,
  source: z.string().max(100).optional().default('api'),
});

serveInternal(async (req, ctx) => {
  const { supabase, body } = ctx;

  const parsed = DispatcherSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Validation failed', issues: parsed.error.flatten().fieldErrors }), {
      status: 400, headers: { 'Content-Type': 'application/json' },
    });
  }

  const { insight: insightData, source } = parsed.data;

  logger.info('[ai-insight-dispatcher] Processing insight:', { id: insightData.id, type: insightData.insight_type, severity: insightData.severity, auto_action_mode: insightData.auto_action_mode, source });

  switch (insightData.auto_action_mode) {
    case 'none':
      return { success: true, action: 'none' };
    case 'suggest':
      return { success: true, action: 'suggested' };
    case 'auto':
      return await handleAutoExecute(supabase, insightData as AIInsight, req.headers.get('origin'));
    case 'auto_with_approval':
      return await handleAutoWithApproval(supabase, insightData as AIInsight, req.headers.get('origin'));
    default:
      return { success: true, action: 'none' };
  }
});
