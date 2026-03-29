import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../_shared/logger.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

  'Access-Control-Allow-Origin': '*',
  'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type, x-agent-token, x-hmac-signature, x-timestamp, x-nonce',
};

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  // CORS preflight
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  const requestId = crypto.randomUUID().slice(0, 8);
  const startTime = Date.now();

  try {
    logger.info('[submit-rollback-event] Request received', { requestId });

    // Initialize Supabase client
    const supabaseUrl = Deno.env.get('SUPABASE_URL')!;
    const supabaseServiceKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
    const supabase = createClient(supabaseUrl, supabaseServiceKey);

    // Get agent token from header
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(
        JSON.stringify({ error: 'Missing X-Agent-Token header' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Hash token and lookup agent
    const tokenHash = hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase
      .from('agent_tokens')
      .select(`
        id,
        agent_id,
        is_active,
        agents!inner (
          id,
          agent_name,
          tenant_id,
          hmac_secret,
          agent_version
        )
      `)
      .eq('token_hash', tokenHash)
      .eq('is_active', true)
      .single();

    if (tokenError || !tokenData) {
      logger.warn('[submit-rollback-event] Invalid agent token', { requestId });
      return new Response(
        JSON.stringify({ error: 'Invalid or inactive agent token' }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    const agent = tokenData.agents as Record<string, unknown>;
    const hmacSecret = agent.hmac_secret;

    // Verify HMAC signature
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, hmacSecret);
    if (!hmacResult.valid) {
      logger.warn('[submit-rollback-event] HMAC verification failed', { 
        requestId, 
        errorCode: hmacResult.errorCode 
      });
      return new Response(
        JSON.stringify({ 
          error: 'HMAC verification failed',
          code: hmacResult.errorCode 
        }),
        { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Parse body from HMAC verification
    const body = JSON.parse(hmacResult.rawBody || '{}');
    
    const {
      from_version,
      to_version,
      reason,
      safe_mode_triggered = false,
      hostname,
      details = {}
    } = body;

    // Validate required fields
    if (!from_version || !to_version || !reason) {
      return new Response(
        JSON.stringify({ error: 'Missing required fields: from_version, to_version, reason' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Validate reason enum
    const validReasons = ['health_check_failed', 'crash_detected', 'state_machine_invalid', 'heartbeat_failed', 'manual_rollback'];
    if (!validReasons.includes(reason)) {
      return new Response(
        JSON.stringify({ error: `Invalid reason. Must be one of: ${validReasons.join(', ')}` }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    // Check for recent rollback from same agent (within 10 minutes) to increment count
    const { data: recentRollback } = await supabase
      .from('agent_rollback_events')
      .select('id, rollback_count')
      .eq('agent_id', agent.id)
      .gte('created_at', new Date(Date.now() - 10 * 60 * 1000).toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    const rollbackCount = recentRollback ? recentRollback.rollback_count + 1 : 1;

    // Insert rollback event
    const { data: rollbackEvent, error: insertError } = await supabase
      .from('agent_rollback_events')
      .insert({
        agent_id: agent.id,
        agent_name: agent.agent_name,
        tenant_id: agent.tenant_id,
        from_version,
        to_version,
        reason,
        rollback_count: rollbackCount,
        safe_mode_triggered,
        details: {
          ...details,
          hostname,
          reported_at: new Date().toISOString(),
          agent_version_current: agent.agent_version
        }
      })
      .select()
      .single();

    if (insertError) {
      logger.error('[submit-rollback-event] Failed to insert rollback event', { 
        requestId, 
        error: insertError.message 
      });
      throw insertError;
    }

    logger.info('[submit-rollback-event] Rollback event recorded', {
      requestId,
      agentName: agent.agent_name,
      fromVersion: from_version,
      toVersion: to_version,
      reason,
      safeMode: safe_mode_triggered,
      rollbackCount
    });

    // If safe mode triggered, create system alert
    if (safe_mode_triggered) {
      await supabase.from('system_alerts').insert({
        tenant_id: agent.tenant_id,
        agent_id: agent.id,
        alert_type: 'agent_safe_mode',
        severity: 'critical',
        message: `Agent "${agent.agent_name}" entered SAFE MODE after ${rollbackCount} consecutive rollbacks. Auto-updates disabled.`,
        resolved: false
      });

      logger.warn('[submit-rollback-event] Agent entered SAFE MODE - alert created', {
        requestId,
        agentName: agent.agent_name,
        rollbackCount
      });
    }

    const elapsed = Date.now() - startTime;

    return new Response(
      JSON.stringify({
        success: true,
        event_id: rollbackEvent.id,
        rollback_count: rollbackCount,
        safe_mode_triggered,
        elapsed_ms: elapsed
      }),
      { 
        status: 200, 
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } 
      }
    );

  } catch (error) {
    const elapsed = Date.now() - startTime;
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[submit-rollback-event] Unexpected error', { 
      requestId, 
      error: errorMessage,
      elapsed 
    });

    return new Response(
      JSON.stringify({ error: 'Internal server error' }),
      { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
    );
  }
});
