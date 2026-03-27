import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = requireEnv('SUPABASE_URL');
const SUPABASE_SERVICE_ROLE_KEY = requireEnv('SUPABASE_SERVICE_ROLE_KEY');

interface AvItem {
  engine_name: string;
  engine_version?: string;
  status?: string;
  last_update_at?: string;
  last_scan_at?: string;
  threats_found?: number;
  raw_data?: unknown;
}

interface AvPayload {
  agent_id: string;
  items: AvItem[];
}

Deno.serve(async (req) => {
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Autenticacao via HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    // Buscar agente via token hash (P0 security fix)
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select(`
        agent_id,
        is_active,
        agents (
          id,
          agent_name,
          tenant_id,
          hmac_secret,
          status
        )
      `)
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (tokenError || !tokenData || !tokenData.agents) {
      logger.warn('Invalid agent token');
      return new Response(JSON.stringify({ error: 'Invalid agent token' }), {
        status: 401,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      });
    }

    const agent = tokenData.agents as any;

    // Validar HMAC
    if (agent.hmac_secret) {
      const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret);
      if (!hmacResult.valid) {
        return new Response(
          JSON.stringify({ 
            error: 'unauthorized',
            code: hmacResult.errorCode,
            message: hmacResult.errorMessage
          }), 
          {
            status: 401,
            headers: { ...corsHeaders, 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Rate limiting
    const rateLimitKey = `av-status:${agent.agent_name}`;
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, 'submit-antivirus-status', {
      maxRequests: 20,
      windowMinutes: 60,
      blockMinutes: 10,
    });
    
    if (!rateLimitResult.allowed) {
      return new Response(
        JSON.stringify({ 
          error: 'Rate limit exceeded', 
          resetAt: rateLimitResult.resetAt 
        }), 
        {
          status: 429,
          headers: { ...corsHeaders, 'Content-Type': 'application/json' },
        }
      );
    }

    const payload: AvPayload = await req.json();

    if (!payload.agent_id || !Array.isArray(payload.items)) {
      return new Response(
        JSON.stringify({ error: 'agent_id and items are required' }),
        { status: 400, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.items.length) {
      logger.info('No AV items to store');
      return new Response(
        JSON.stringify({ success: true, inserted: 0 }),
        { status: 200, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`Storing ${payload.items.length} AV status items for agent ${agent.agent_name}`);

    // Limpar status anterior
    const { error: deleteError } = await supabase
      .from('antivirus_status')
      .delete()
      .eq('agent_id', payload.agent_id);

    if (deleteError) {
      logger.error('Failed to clear old AV status', deleteError);
    }

    // Inserir novos itens
    const itemsToInsert = payload.items.map(item => ({
      tenant_id: agent.tenant_id,
      agent_id: payload.agent_id,
      engine_name: item.engine_name,
      engine_version: item.engine_version || null,
      status: item.status || null,
      last_update_at: item.last_update_at ? new Date(item.last_update_at).toISOString() : null,
      last_scan_at: item.last_scan_at ? new Date(item.last_scan_at).toISOString() : null,
      threats_found: item.threats_found || null,
      raw_data: item.raw_data || {},
    }));

    const { error: insertError } = await supabase
      .from('antivirus_status')
      .insert(itemsToInsert);

    if (insertError) {
      logger.error('Failed to insert AV status', insertError);
      return new Response(
        JSON.stringify({ error: 'Failed to store AV status' }),
        { status: 500, headers: { ...corsHeaders, 'Content-Type': 'application/json' } }
      );
    }

    logger.success(`AV status stored: ${payload.items.length} items`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        inserted: payload.items.length 
      }), 
      {
        status: 200,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    logger.error('AV status submission failed', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...corsHeaders, 'Content-Type': 'application/json' },
      }
    );
  }
});
