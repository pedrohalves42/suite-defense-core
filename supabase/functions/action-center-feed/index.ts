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
import { buildFeed } from './feed-builder.ts';
import { handleAction } from './action-handler.ts';

serveTenant(async (req, ctx) => {
  const { supabase, userId, tenantId, requestId } = ctx;

  // Create service client for admin operations
  const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
  const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
  const serviceClient = createClient(supabaseUrl, supabaseServiceKey);

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
    const body = ctx.body as Record<string, unknown>;

    // Create user-context client for function invocations
    const authHeader = req.headers.get('Authorization') || '';
    const userClient = createClient(supabaseUrl, supabaseServiceKey, {
      global: { headers: { Authorization: authHeader } },
    });

    // Get user email for audit
    const { data: { user } } = await serviceClient.auth.getUser(authHeader.replace('Bearer ', ''));

    return await handleAction(
      serviceClient,
      userClient,
      userId,
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
