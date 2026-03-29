/**
 * collect-router -- Consolidated agent data collection endpoint
 * 
 * Replaces individual collect-* functions with a single entry point.
 * All actions use serveAgent middleware (agent token auth).
 * 
 * Usage: POST /collect-router
 * Body: { "type": "certificates" | "usb-devices", ...payload }
 * Headers: X-Agent-Token
 * 
 * Auth: Agent token (X-Agent-Token via serveAgent)
 */

import { serveAgent } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

// Direct handlers (logic inlined from original functions)
import { handleCertificates } from './handlers/certificates.ts';
import { handleUsbDevices } from './handlers/usb-devices.ts';

type CollectHandler = (
  supabase: import('https://esm.sh/@supabase/supabase-js@2.74.0').SupabaseClient,
  agentId: string,
  agentName: string,
  tenantId: string,
  requestId: string,
  body: Record<string, unknown>,
) => Promise<Response | Record<string, unknown>>;

const HANDLERS: Record<string, CollectHandler> = {
  'certificates': handleCertificates,
  'usb-devices': handleUsbDevices,
  'usb_devices': handleUsbDevices, // alias
};

serveAgent(async (_req, ctx) => {
  const { supabase, agentId, agentName, tenantId, requestId, body } = ctx;
  const payload = body as Record<string, unknown>;
  const type = (payload.type as string) || '';

  if (!type) {
    return new Response(
      JSON.stringify({ error: 'Missing "type" field', available: Object.keys(HANDLERS) }),
      { status: 400, headers: { 'Content-Type': 'application/json' } },
    );
  }

  const handler = HANDLERS[type];
  if (!handler) {
    return new Response(
      JSON.stringify({ error: `Unknown collect type: ${type}`, available: Object.keys(HANDLERS) }),
      { status: 404, headers: { 'Content-Type': 'application/json' } },
    );
  }

  logger.info(`[${requestId}] collect-router: type=${type} agent=${agentId}`);

  const result = await handler(supabase, agentId, agentName || '', tenantId, requestId, payload);
  if (result instanceof Response) return result;
  return new Response(JSON.stringify(result), {
    status: 200, headers: { 'Content-Type': 'application/json' },
  });
});
