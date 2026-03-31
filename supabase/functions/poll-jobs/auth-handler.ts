/**
 * Agent authentication and HMAC verification for poll-jobs
 * Extraído de poll-jobs/index.ts para modularização
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { normalizeVersion } from '../_shared/hexagonal/update-decision-service.ts';
import { AgentTokenSchema } from '../_shared/validation.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';

export const HMAC_REQUIRED_MIN_VERSION = '5.0.12';

export interface AuthenticatedAgent {
  agentId: string;
  agentName: string;
  hmacSecret: string;
  agentVersion: string;
  tenantId: string | null;
  lastHeartbeat: string | null;
  status: string | null;
  tokenHash: string;
  isModernAgent: boolean;
  isLegacyAgent: boolean;
}

interface AgentRecord {
  agent_name: string;
  hmac_secret: string;
  agent_version: string;
  tenant_id: string;
  last_heartbeat: string | null;
  status: string;
}

/**
 * Authenticates agent via X-Agent-Token, validates HMAC, and returns agent data.
 */
export async function authenticateAndValidateAgent(
  req: Request,
  supabase: SupabaseClient,
  origin: string | null,
): Promise<{ success: true; agent: AuthenticatedAgent } | { success: false; response: Response }> {
  const agentToken = req.headers.get('X-Agent-Token');
  if (!agentToken) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Token do agente necessario' }),
        { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }, status: 401 }
      ),
    };
  }

  const tokenValidation = AgentTokenSchema.safeParse(agentToken);
  if (!tokenValidation.success) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Formato de token invalido' }),
        { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }, status: 400 }
      ),
    };
  }

  const tokenHash = await hashToken(agentToken);
  const { data: token } = await supabase
    .from('agent_tokens')
    .select('agent_id, agents!inner(agent_name, hmac_secret, agent_version, tenant_id, last_heartbeat, status)')
    .eq('token_hash', tokenHash)
    .eq('is_active', true)
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (!token?.agents) {
    return {
      success: false,
      response: new Response(
        JSON.stringify({ error: 'Token invalido' }),
        { headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' }, status: 401 }
      ),
    };
  }

  const agent: AgentRecord = Array.isArray(token.agents) ? token.agents[0] : token.agents;
  const agentVersionStr = agent.agent_version || '';
  const currentNormV = normalizeVersion(agentVersionStr);
  const hmacMinNormV = normalizeVersion(HMAC_REQUIRED_MIN_VERSION);
  const isModernAgent = !!(currentNormV && hmacMinNormV && currentNormV >= hmacMinNormV);

  // Version compatibility detection
  const parseVersion = (v: string): number[] => {
    const m = v.replace(/^v/, '').match(/^(\d+)\.(\d+)\.(\d+)/);
    return m ? [Number(m[1]), Number(m[2]), Number(m[3])] : [0, 0, 0];
  };
  const agentVer = parseVersion(agentVersionStr || 'v0.0.0');
  const isLegacyAgent = agentVer[0] < 5 || (agentVer[0] === 5 && agentVer[1] === 0 && agentVer[2] <= 11);

  // HMAC validation
  const hasHmacSignature = !!req.headers.get('X-HMAC-Signature');
  const hasHmacTimestamp = !!(req.headers.get('X-HMAC-Timestamp') || req.headers.get('X-Timestamp'));
  const hasHmacNonce = !!(req.headers.get('X-HMAC-Nonce') || req.headers.get('X-Nonce'));
  const hasAnyHmacHeader = hasHmacSignature || hasHmacTimestamp || hasHmacNonce;

  // Diagnostics
  if (req.method === 'GET') {
    logger.warn('DIAGNOSTIC: Agent using GET method (pre-hotfix script)', { agentName: agent.agent_name, method: req.method });
  }
  if (!hasAnyHmacHeader) {
    logger.warn('DIAGNOSTIC: Agent poll-jobs request WITHOUT HMAC headers', { agentName: agent.agent_name, method: req.method });
  }

  if (hasAnyHmacHeader) {
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret, {
      agentId: token.agent_id,
      tenantId: agent.tenant_id || undefined,
      endpoint: 'poll-jobs',
      ip: req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || undefined,
    });
    if (!hmacResult.valid) {
      if (isModernAgent) {
        logger.error('SECURITY: HMAC verification FAILED for modern agent poll-jobs - BLOCKED', { agent: agent.agent_name, agentVersion: agentVersionStr, errorCode: hmacResult.errorCode });
        return {
          success: false,
          response: new Response(
            JSON.stringify({ error: 'HMAC verification failed', code: 'HMAC_INVALID' }),
            { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
          ),
        };
      }
      logger.warn('HMAC verification failed - accepting legacy agent poll-jobs', { agent: agent.agent_name, errorCode: hmacResult.errorCode });
    }
  } else {
    if (isModernAgent) {
      logger.error('SECURITY: Modern agent poll-jobs WITHOUT HMAC headers - BLOCKED', { agent: agent.agent_name, agentVersion: agentVersionStr });
      return {
        success: false,
        response: new Response(
          JSON.stringify({ error: 'HMAC headers required', code: 'HMAC_MISSING' }),
          { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } }
        ),
      };
    }
    logger.warn('Poll-jobs accepted without HMAC (legacy agent)', { agent: agent.agent_name, agentVersion: agentVersionStr });
  }

  return {
    success: true,
    agent: {
      agentId: token.agent_id,
      agentName: agent.agent_name,
      hmacSecret: agent.hmac_secret,
      agentVersion: agentVersionStr,
      tenantId: agent.tenant_id || null,
      lastHeartbeat: agent.last_heartbeat || null,
      status: agent.status || null,
      tokenHash,
      isModernAgent,
      isLegacyAgent,
    },
  };
}
