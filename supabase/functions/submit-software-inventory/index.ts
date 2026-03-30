import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { SoftwareItem, deduplicateInventory, persistInventory } from './inventory-processor.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

interface InventoryPayload {
  agent_id: string;
  items: SoftwareItem[];
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest();
  const methodError = validateHttpMethod(req, ['POST']);
  if (methodError) return methodError;

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), {
        status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select(`agent_id, is_active, agents (id, agent_name, tenant_id, hmac_secret, status)`)
      .eq('token_hash', tokenHash).eq('is_active', true)
      .order('created_at', { ascending: false }).limit(1).maybeSingle();

    if (tokenError || !tokenData || !tokenData.agents) {
      return new Response(JSON.stringify({ error: 'Invalid agent token' }), {
        status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const agent = tokenData.agents as Record<string, unknown>;

    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
      if (!hmacResult.valid) {
        return new Response(
          JSON.stringify({ error: 'unauthorized', code: hmacResult.errorCode, message: hmacResult.errorMessage }),
          { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
        );
      }
    }

    const rl = await checkRateLimit(supabase, `software-inventory:${agent.agent_name}`, 'submit-software-inventory', {
      maxRequests: 60, windowMinutes: 60, blockMinutes: 10,
    });
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rl.resetAt }), {
        status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const payload: InventoryPayload = await req.json();

    if (!payload.agent_id || !Array.isArray(payload.items)) {
      return new Response(JSON.stringify({ error: 'agent_id and items are required' }), {
        status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    if (!payload.items.length) {
      return new Response(JSON.stringify({ success: true, inserted: 0 }), {
        status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    logger.info(`Storing ${payload.items.length} software items for agent ${agent.agent_name}`);

    const uniqueItems = deduplicateInventory(payload.items);
    logger.info(`Deduplicated: ${payload.items.length} -> ${uniqueItems.length} unique items`);

    if (uniqueItems.length === 0) {
      return new Response(JSON.stringify({ success: true, inserted: 0, deduplicated_from: payload.items.length }), {
        status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const result = await persistInventory(supabase, payload.agent_id, agent.tenant_id as string, uniqueItems);

    if (!result.success) {
      return new Response(JSON.stringify({ error: 'Failed to store inventory' }), {
        status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    logger.success(`Software inventory stored: ${result.count} unique items (deduplicated from ${payload.items.length})`);

    return new Response(
      JSON.stringify({ success: true, inserted: result.count, deduplicated_from: payload.items.length }),
      { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    logger.error('Software inventory submission failed', error);
    return new Response(JSON.stringify({ error: 'Internal server error' }), {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
