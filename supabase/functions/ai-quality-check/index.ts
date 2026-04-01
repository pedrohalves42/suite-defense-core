/**
 * ai-quality-check — Migrated to serveTenant middleware
 * Module: handlers
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { handlePromptInventory, handleQualityCheck, handleDriftAnalysis } from './handlers.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const ActionSchema = z.object({
  action: z.enum(['prompt_inventory', 'quality_check', 'drift_analysis']),
});

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, body } = ctx;
  const parsed = ActionSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const { action } = parsed.data;
  const origin = _req.headers.get('origin');

  switch (action) {
    case 'prompt_inventory': return await handlePromptInventory(origin);
    case 'quality_check': return await handleQualityCheck(tenantId, origin);
    case 'drift_analysis': return await handleDriftAnalysis(supabase, origin);
    default:
      return { error: 'Unknown action' };
  }
});
