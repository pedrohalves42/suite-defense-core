/**
 * submit-antivirus-status — Migrated to serveAgent middleware with HMAC verification.
 */
import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const AvItemSchema = z.object({
  engine_name: z.string().min(1).max(255),
  engine_version: z.string().max(100).optional(),
  status: z.string().max(50).optional(),
  last_update_at: z.string().optional(),
  last_scan_at: z.string().optional(),
  threats_found: z.number().int().min(0).optional(),
  raw_data: z.unknown().optional(),
});

const SubmitAvSchema = z.object({
  agent_id: z.string().uuid(),
  items: z.array(AvItemSchema).max(100),
});

serveAgent(async (_req, ctx) => {
  const { supabase, agentName, tenantId, body } = ctx;

  const parsed = SubmitAvSchema.safeParse(body);
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const payload = parsed.data;

  if (!payload.items.length) {
    return { success: true, inserted: 0 };
  }

  logger.info(`Storing ${payload.items.length} AV status items for agent ${agentName}`);

  // Clear old status
  await supabase.from('antivirus_status').delete().eq('agent_id', payload.agent_id);

  const itemsToInsert = payload.items.map(item => ({
    tenant_id: tenantId,
    agent_id: payload.agent_id,
    engine_name: item.engine_name,
    engine_version: item.engine_version || null,
    status: item.status || null,
    last_update_at: item.last_update_at ? new Date(item.last_update_at).toISOString() : null,
    last_scan_at: item.last_scan_at ? new Date(item.last_scan_at).toISOString() : null,
    threats_found: item.threats_found || null,
    raw_data: item.raw_data || {},
  }));

  const { error: insertError } = await supabase.from('antivirus_status').insert(itemsToInsert);

  if (insertError) {
    logger.error('Failed to insert AV status', insertError);
    return new Response(JSON.stringify({ error: 'Failed to store AV status' }), { status: 500, headers: { 'Content-Type': 'application/json' } });
  }

  return { success: true, inserted: payload.items.length };
}, {
  hmacVerify: true,
  rateLimit: { endpoint: 'submit-antivirus-status', maxRequests: 20, windowMinutes: 60, blockMinutes: 10 },
});
