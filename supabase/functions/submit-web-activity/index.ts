import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { loadBlockedPatterns } from './dns-classifier.ts';
import { WebActivityItem, prepareItems, deduplicateItems, persistActivity } from './activity-processor.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

interface WebActivityPayload {
  agent_id: string;
  items: WebActivityItem[];
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Auth via HMAC
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

    const rl = await checkRateLimit(supabase, `web-activity:${agent.agent_name}`, 'submit-web-activity', {
      maxRequests: 20, windowMinutes: 60, blockMinutes: 10,
    });
    if (!rl.allowed) {
      return new Response(JSON.stringify({ error: 'Rate limit exceeded', resetAt: rl.resetAt }), {
        status: 429, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    let payload: WebActivityPayload;
    let rawBody = '';
    try {
      rawBody = await req.text();
      payload = JSON.parse(rawBody);
    } catch (parseError) {
      logger.error('Failed to parse web activity payload', {
        error: parseError instanceof Error ? parseError.message : String(parseError),
        rawBodyLength: rawBody.length, agentName: agent.agent_name,
      });
      return new Response(JSON.stringify({ error: 'Invalid JSON payload', bodyLength: rawBody.length }), {
        status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const effectiveAgentId = payload.agent_id || (agent.id as string);

    if (!effectiveAgentId || !Array.isArray(payload.items)) {
      return new Response(JSON.stringify({ error: 'items array is required' }), {
        status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    if (!payload.items.length) {
      return new Response(JSON.stringify({ success: true, inserted: 0 }), {
        status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    logger.info(`Storing ${payload.items.length} web activity items for agent ${agent.agent_name}`);

    const blockedPatterns = await loadBlockedPatterns(supabase, agent.tenant_id as string);
    const prepared = prepareItems(payload.items, effectiveAgentId, agent.tenant_id as string, blockedPatterns);
    const deduped = deduplicateItems(prepared);

    if (deduped.length < prepared.length) {
      logger.info(`Deduped ${prepared.length} → ${deduped.length} items`);
    }

    const { insertedCount, updatedCount } = await persistActivity(supabase, effectiveAgentId, deduped);
    logger.info(`Web activity processed: ${insertedCount} inserted, ${updatedCount} updated`);

    return new Response(JSON.stringify({ success: true, inserted: payload.items.length }), {
      status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logger.error('Web activity submission failed', { error: errorMessage, phase: 'uncaught_exception' });
    return new Response(JSON.stringify({ error: 'Internal server error', details: errorMessage }), {
      status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
    });
  }
});
