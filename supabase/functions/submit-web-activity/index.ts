/**
 * submit-web-activity — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { loadBlockedPatterns } from './dns-classifier.ts';
import { WebActivityItem, prepareItems, deduplicateItems, persistActivity } from './activity-processor.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const WebActivityItemSchema = z.object({
  url: z.string().max(2048).optional(),
  domain: z.string().max(255).optional(),
  title: z.string().max(500).optional(),
  visited_at: z.string().optional(),
  duration_seconds: z.number().int().min(0).optional(),
  browser: z.string().max(100).optional(),
}).passthrough();

const SubmitWebActivitySchema = z.object({
  agent_id: z.string().uuid().optional(),
  items: z.array(WebActivityItemSchema).max(1000),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, body } = ctx;

  const parsed = SubmitWebActivitySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const effectiveAgentId = parsed.data.agent_id || agentId;

  if (!effectiveAgentId) {
    return new Response(JSON.stringify({ error: 'agent_id is required' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  if (!parsed.data.items.length) {
    return { success: true, inserted: 0 };
  }

  logger.info(`Storing ${parsed.data.items.length} web activity items for agent ${agentName}`);

  const blockedPatterns = await loadBlockedPatterns(supabase, tenantId);
  const prepared = prepareItems(parsed.data.items as WebActivityItem[], effectiveAgentId, tenantId, blockedPatterns);
  const deduped = deduplicateItems(prepared);

  if (deduped.length < prepared.length) {
    logger.info(`Deduped ${prepared.length} → ${deduped.length} items`);
  }

  const { insertedCount, updatedCount } = await persistActivity(supabase, effectiveAgentId, deduped);
  logger.info(`Web activity processed: ${insertedCount} inserted, ${updatedCount} updated`);

  return { success: true, inserted: parsed.data.items.length };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-web-activity', maxRequests: 20, windowMinutes: 60, blockMinutes: 10 },
});
