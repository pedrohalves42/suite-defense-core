import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { corsHeaders, buildCorsHeaders } from '../_shared/cors.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { checkRateLimit } from '../_shared/rate-limit.ts';
import { logger } from '../_shared/logger.ts';
import { hashToken } from '../_shared/token-hash.ts';

const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;

interface VulnFinding {
  severity: 'low' | 'medium' | 'high' | 'critical';
  check_key: string;
  title: string;
  description?: string;
  remediation?: string;
}

interface VulnPayload {
  agent_id: string;
  findings: VulnFinding[];
}

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') {
    return new Response(null, { headers: buildCorsHeaders(origin) });
  }

  try {
    const supabase = createClient(SUPABASE_URL, SUPABASE_SERVICE_ROLE_KEY);

    // Autenticacao via HMAC
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      return new Response(JSON.stringify({ error: 'Missing agent token' }), {
        status: 401,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
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
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      });
    }

    const agent = tokenData.agents as Record<string, unknown>;

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
            headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
          }
        );
      }
    }

    // Rate limiting
    const rateLimitKey = `vuln-findings:${agent.agent_name}`;
    const rateLimitResult = await checkRateLimit(supabase, rateLimitKey, 'submit-vuln-findings', {
      maxRequests: 10,
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
          headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
        }
      );
    }

    const payload: VulnPayload = await req.json();

    if (!payload.agent_id || !Array.isArray(payload.findings)) {
      return new Response(
        JSON.stringify({ error: 'agent_id and findings are required' }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    if (!payload.findings.length) {
      logger.info('No vuln findings to store');
      return new Response(
        JSON.stringify({ success: true, upserted: 0 }),
        { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
      );
    }

    logger.info(`Storing ${payload.findings.length} vuln findings for agent ${agent.agent_name}`);

    // Upsert por (agent_id, check_key)
    for (const finding of payload.findings) {
      const { error: upsertError } = await supabase
        .from('vuln_findings')
        .upsert({
          tenant_id: agent.tenant_id,
          agent_id: payload.agent_id,
          severity: finding.severity,
          check_key: finding.check_key,
          title: finding.title,
          description: finding.description || null,
          remediation: finding.remediation || null,
          last_seen_at: new Date().toISOString(),
        }, {
          onConflict: 'agent_id,check_key',
        });

      if (upsertError) {
        logger.error(`Failed to upsert finding ${finding.check_key}`, upsertError);
      }
    }

    logger.success(`Vuln findings stored: ${payload.findings.length} items`);

    return new Response(
      JSON.stringify({ 
        success: true, 
        upserted: payload.findings.length 
      }), 
      {
        status: 200,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );

  } catch (error) {
    logger.error('Vuln findings submission failed', error);
    return new Response(
      JSON.stringify({ error: 'Internal server error' }), 
      {
        status: 500,
        headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' },
      }
    );
  }
});
