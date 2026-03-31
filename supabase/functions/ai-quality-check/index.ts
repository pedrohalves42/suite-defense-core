/**
 * ai-quality-check — Migrated to serveTenant middleware
 * Module: handlers
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { handlePromptInventory, handleQualityCheck, handleDriftAnalysis } from './handlers.ts';

serveTenant(async (_req, ctx) => {
  const { supabase, tenantId, body } = ctx;
  const { action } = body as { action?: string };
  const origin = _req.headers.get('origin');

  switch (action) {
    case 'prompt_inventory': return await handlePromptInventory(origin);
    case 'quality_check': return await handleQualityCheck(tenantId, origin);
    case 'drift_analysis': return await handleDriftAnalysis(supabase, origin);
    default:
      return { error: 'Unknown action' };
  }
});
