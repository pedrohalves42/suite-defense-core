// D17-D3: @ts-nocheck removed. Typing only — feed builder, action dispatch,
// service-role wiring and gateway proxy POST contract unchanged.
/**
 * action-center-feed — Orchestrator
 * Migrated to serveTenant middleware + modular handlers
 */
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import {
  healthProbeMiddleware,
  addHealthHeaders,
} from '../_shared/health-probe.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { Database } from '../_shared/database.types.ts';
import { buildFeed } from './feed-builder.ts';
import { handleAction } from './action-handler.ts';

serveTenant(async (req, ctx) => {
  const { supabase, userId, tenantId, requestId } = ctx;

  // Create service client for admin operations
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const serviceClient = createClient<Database>(supabaseUrl, supabaseServiceKey);

  // Health probe check
  const origin = req.headers.get('origin');
  const healthCheck = await healthProbeMiddleware(serviceClient, { 'Content-Type': 'application/json' });
  if (healthCheck) return healthCheck;

  if (req.method === 'GET') {
    logger.debug(`[action-center-feed][${requestId}] Building feed for tenant ${tenantId}`);
    const feed = await buildFeed(serviceClient, tenantId);

    logger.debug(`[action-center-feed][${requestId}] Feed generated:`, {
      urgent: feed.urgent.length,
      recommended: feed.recommended.length,
      informational: feed.informational.length,
    });

    return feed;
  }

  if (req.method === 'POST') {
    const { z } = await import('https://esm.sh/zod@3.23.8');
    const ActionSchema = z.object({
      action: z.string().min(1).max(200),
      payload: z.record(z.unknown()).optional(),
    }).passthrough();
    const parsed = ActionSchema.safeParse(ctx.body);
    if (!parsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid input', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const body = parsed.data as Record<string, unknown>;

    // Handle 'get-feed' action from gateway proxy (gateway always sends POST)
    if (body.action === 'get-feed') {
      logger.debug(`[action-center-feed][${requestId}] Building feed for tenant ${tenantId} (via POST get-feed)`);
      const feed = await buildFeed(serviceClient, tenantId);
      return feed;
    }

    // Create user-context client for function invocations.
    // SECURITY (Sprint 1 / FINDING-2026-06-29-ACF-SERVICE-ROLE-PROPAGATION):
    // MUST use ANON_KEY here — never SERVICE_ROLE_KEY. Downstream Edge Functions
    // (execute-playbook-action, auto-remediate, ai-router) authenticate from the
    // forwarded `Authorization: Bearer <user_jwt>` header via serveTenant →
    // supabase.auth.getUser(token). The `apikey` header is intentionally the
    // public anon key so a compromised downstream cannot be tricked into
    // operating with service-role privileges.
    const authHeader = req.headers.get('Authorization') || '';
    const supabaseAnonKey = Deno.env.get('SUPABASE_ANON_KEY')!;
    const userClient = createClient<Database>(supabaseUrl, supabaseAnonKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user email for audit
    const { data: { user } } = await serviceClient.auth.getUser(authHeader.replace('Bearer ', ''));

    return await handleAction(
      serviceClient,
      userClient,
      userId || '',
      user?.email,
      tenantId,
      body,
    );
  }

  return new Response(
    JSON.stringify({ error: 'Method not allowed' }),
    { status: 405, headers: { 'Content-Type': 'application/json' } }
  );
}, { methods: ['GET', 'POST'] });