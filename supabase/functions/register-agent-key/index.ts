/**
 * register-agent-key - Agent public key registration
 * MODULARIZED: Fingerprint utils in fingerprint-utils.ts
 *
 * Auth: serveAgent middleware (HMAC verified before handler).
 * D8-A: removed @ts-nocheck. Runtime unchanged; types tightened with
 * `SupabaseClient<Database>` cast and explicit narrowing.
 */
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import type { Database } from '../_shared/database.types.ts';
import { handleException } from '../_shared/error-handler.ts';
import { logSecurityEvent } from '../_shared/security-log.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { computeAllKeyFingerprints } from './fingerprint-utils.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import { serveAgent, type AgentContext } from '../_shared/serve-agent.ts';

const RegisterKeySchema = z.object({
  public_key: z.string().min(1).max(10000),
  key_fingerprint: z.string().regex(/^[a-fA-F0-9]{64}$/, 'Must be 64 hex characters (SHA256)'),
  algorithm: z
    .enum(['ECDSA-P256-SHA256', 'Ed25519', 'RSA-2048-SHA256', 'RSA-2048-XML', 'RSA-2048-CSP'])
    .default('ECDSA-P256-SHA256'),
});

type OrphanKeyRow = {
  id: string;
  key_fingerprint: string;
  algorithm: string;
  created_at: string;
};

type RegisterKeyRpcRow = {
  key_id: string;
  version: number;
  valid_from: string;
};

serveAgent(async (req: Request, ctx: AgentContext) => {
  const { requestId, agentId, agentName, tenantId, body: rawPayload } = ctx;
  const supabase = ctx.supabase as SupabaseClient<Database>;
  const traceId = requestId;
  const origin = req.headers.get('origin');
  const ipAddress =
    req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  try {
    // 4. Parse and validate payload with Zod (rawPayload is unknown)
    const validated = RegisterKeySchema.safeParse(rawPayload);
    if (!validated.success) {
      return new Response(
        JSON.stringify({ error: 'Invalid payload', issues: validated.error.flatten().fieldErrors }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      );
    }
    const payload = validated.data;
    const algorithm = payload.algorithm;

    // 5. Verify fingerprint
    const computedFingerprints = await computeAllKeyFingerprints(payload.public_key);
    const providedFp = payload.key_fingerprint.toLowerCase();
    const matchedFingerprint = computedFingerprints.find((entry) => entry.fingerprint === providedFp);
    if (!matchedFingerprint) {
      await logSecurityEvent({
        supabase,
        tenantId,
        ipAddress,
        endpoint: '/register-agent-key',
        attackType: 'invalid_input',
        severity: 'high',
        blocked: true,
        details: { agent_name: agentName, reason: 'key_tampering' },
      });
      return new Response(
        JSON.stringify({
          error: 'Fingerprint does not match public key content',
          modes_tried: computedFingerprints.map((e) => e.mode),
        }),
        { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      );
    }

    // 6. Check existing key
    const { data: existingKey } = await supabase
      .from('agent_signing_keys')
      .select('id, version, revoked_at')
      .eq('agent_id', agentId)
      .eq('key_fingerprint', providedFp)
      .maybeSingle();
    if (existingKey) {
      if (existingKey.revoked_at) {
        return new Response(
          JSON.stringify({ error: 'This key was previously revoked', key_id: existingKey.id }),
          { status: 409, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
        );
      }
      return {
        success: true,
        message: 'Key already registered',
        key_id: existingKey.id,
        version: existingKey.version,
        already_registered: true,
      };
    }

    // 7. Cleanup orphan keys (BUG 6 FIX)
    try {
      const { data: orphanKeys } = await supabase
        .from('agent_signing_keys')
        .select('id, key_fingerprint, algorithm, created_at')
        .eq('agent_id', agentId)
        .eq('is_active', true)
        .is('revoked_at', null);
      const orphans = (orphanKeys ?? []) as unknown as OrphanKeyRow[];
      if (orphans.length > 1) {
        const sorted = [...orphans].sort(
          (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime(),
        );
        const toDeactivate = sorted.slice(1).map((k) => k.id);
        if (toDeactivate.length > 0) {
          await supabase
            .from('agent_signing_keys')
            .update({ is_active: false, valid_until: new Date().toISOString() })
            .in('id', toDeactivate);
        }
      }
    } catch (err) {
      logger.warn('[register-agent-key] orphan key deactivation failed', err);
    }

    // 8. Register new key
    const { data: registerResult, error: registerError } = await supabase.rpc(
      'register_agent_signing_key',
      {
        p_agent_id: agentId,
        p_public_key: payload.public_key,
        p_fingerprint: providedFp,
        p_algorithm: algorithm,
      },
    );
    if (registerError) {
      return new Response(
        JSON.stringify({ error: 'Failed to register key', details: registerError.message }),
        { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
      );
    }

    const rpcResult = registerResult as unknown;
    const result: RegisterKeyRpcRow = Array.isArray(rpcResult)
      ? (rpcResult[0] as RegisterKeyRpcRow)
      : (rpcResult as RegisterKeyRpcRow);

    logger.info('[register-agent-key] Key registered:', {
      agent: agentName,
      keyId: result.key_id,
      version: result.version,
    });

    return new Response(
      JSON.stringify({
        success: true,
        key_id: result.key_id,
        version: result.version,
        valid_from: result.valid_from,
        registered_at: new Date().toISOString(),
        algorithm,
      }),
      { status: 201, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } },
    );
  } catch (error) {
    logger.error('[register-agent-key] Unexpected error:', error);
    return handleException(error, traceId, 'register-agent-key');
  }
}, {
  hmacVerify: true,
  rateLimit: {
    endpoint: 'register-agent-key',
    maxRequests: 5,
    windowMinutes: 10,
    blockMinutes: 30,
  },
});
