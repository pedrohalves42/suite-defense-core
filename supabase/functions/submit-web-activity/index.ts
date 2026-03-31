/**
 * submit-web-activity — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { loadBlockedPatterns } from './dns-classifier.ts';
import { WebActivityItem, prepareItems, deduplicateItems, persistActivity } from './activity-processor.ts';

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, body } = ctx;
  const payload = body as { agent_id?: string; items?: WebActivityItem[] };

  const effectiveAgentId = payload.agent_id || agentId;

  if (!effectiveAgentId || !Array.isArray(payload.items)) {
    return new Response(JSON.stringify({ error: 'items array is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!payload.items.length) {
    return { success: true, inserted: 0 };
  }

  logger.info(`Storing ${payload.items.length} web activity items for agent ${agentName}`);

  const blockedPatterns = await loadBlockedPatterns(supabase, tenantId);
  const prepared = prepareItems(payload.items, effectiveAgentId, tenantId, blockedPatterns);
  const deduped = deduplicateItems(prepared);

  if (deduped.length < prepared.length) {
    logger.info(`Deduped ${prepared.length} → ${deduped.length} items`);
  }

  const { insertedCount, updatedCount } = await persistActivity(supabase, effectiveAgentId, deduped);
  logger.info(`Web activity processed: ${insertedCount} inserted, ${updatedCount} updated`);

  return { success: true, inserted: payload.items.length };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-web-activity', maxRequests: 20, windowMinutes: 60, blockMinutes: 10 },
});
