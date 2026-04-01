/**
 * submit-software-inventory — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { SoftwareItem, deduplicateInventory, persistInventory } from './inventory-processor.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const SoftwareItemSchema = z.object({
  name: z.string().max(500).optional(),
  version: z.string().max(100).optional(),
  publisher: z.string().max(500).optional(),
  install_date: z.string().max(50).optional(),
  install_location: z.string().max(1024).optional(),
  size_bytes: z.number().min(0).optional(),
}).passthrough();

const SubmitInventorySchema = z.object({
  agent_id: z.string().uuid(),
  items: z.array(SoftwareItemSchema).max(5000),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, body } = ctx;

  const parsed = SubmitInventorySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const payload = parsed.data as { agent_id: string; items: SoftwareItem[] };

  if (!payload.items.length) {
    return { success: true, inserted: 0 };
  }

  logger.info(`Storing ${payload.items.length} software items for agent ${agentName}`);

  const uniqueItems = deduplicateInventory(payload.items);
  logger.info(`Deduplicated: ${payload.items.length} -> ${uniqueItems.length} unique items`);

  if (uniqueItems.length === 0) {
    return { success: true, inserted: 0, deduplicated_from: payload.items.length };
  }

  const result = await persistInventory(supabase, payload.agent_id, tenantId, uniqueItems);

  if (!result.success) {
    return new Response(JSON.stringify({ error: 'Failed to store inventory' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return { success: true, inserted: result.count, deduplicated_from: payload.items.length };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-software-inventory', maxRequests: 60, windowMinutes: 60, blockMinutes: 10 },
});
