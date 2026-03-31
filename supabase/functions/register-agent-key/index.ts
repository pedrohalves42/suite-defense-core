/**
 * register-agent-key - Agent public key registration
 * MODULARIZED: Fingerprint utils in fingerprint-utils.ts
 * 
 * Auth: Deno.serve (raw body for HMAC)
 */
import { requireEnv } from '../_shared/env.ts';
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { handleException } from '../_shared/error-handler.ts';
import { verifyHmacSignature } from '../_shared/hmac.ts';
import { validateHttpMethod, handleCorsPreflightRequest } from '../_shared/http-method-validator.ts';
import { hashToken } from '../_shared/token-hash.ts';
import { logSecurityEvent } from '../_shared/security-log.ts';
import { logger } from '../_shared/logger.ts';
import { buildCorsHeaders } from '../_shared/cors.ts';
import { computeAllKeyFingerprints } from './fingerprint-utils.ts';

Deno.serve(async (req) => {
  const origin = req.headers.get("origin");
  if (req.method === 'OPTIONS') return handleCorsPreflightRequest();
  const methodError = validateHttpMethod(req, ['POST']);
  if (methodError) return methodError;

  const supabase = createClient(requireEnv('SUPABASE_URL'), requireEnv('SUPABASE_SERVICE_ROLE_KEY'));
  const ipAddress = req.headers.get('x-forwarded-for') || req.headers.get('x-real-ip') || 'unknown';

  try {
    // 1. Authenticate via token
    const agentToken = req.headers.get('X-Agent-Token');
    if (!agentToken) {
      await logSecurityEvent({ supabase, ipAddress, endpoint: '/register-agent-key', attackType: 'unauthorized', severity: 'medium', blocked: true, details: { reason: 'Missing X-Agent-Token' } });
      return new Response(JSON.stringify({ error: 'X-Agent-Token header required' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // 2. Lookup agent
    const tokenHash = await hashToken(agentToken);
    const { data: tokenData, error: tokenError } = await supabase.from('agent_tokens').select('agent_id, agents!inner(id, agent_name, tenant_id, hmac_secret)').eq('token_hash', tokenHash).eq('is_active', true).maybeSingle();
    if (tokenError || !tokenData?.agents) {
      await logSecurityEvent({ supabase, ipAddress, endpoint: '/register-agent-key', attackType: 'unauthorized', severity: 'high', blocked: true, details: { token_prefix: agentToken.substring(0, 8) } });
      return new Response(JSON.stringify({ error: 'Invalid or inactive token' }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }
    const agent = Array.isArray(tokenData.agents) ? tokenData.agents[0] : tokenData.agents;

    // 3. Verify HMAC
    if (!agent.hmac_secret) return new Response(JSON.stringify({ error: 'HMAC secret not configured' }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    const hmacResult = await verifyHmacSignature(supabase, req, agent.agent_name, agent.hmac_secret, { agentId: agent.id, tenantId: agent.tenant_id, endpoint: '/register-agent-key', ip: ipAddress });
    if (!hmacResult.valid) {
      await logSecurityEvent({ supabase, tenantId: agent.tenant_id, ipAddress, endpoint: '/register-agent-key', attackType: 'unauthorized', severity: 'high', blocked: true, details: { agent_name: agent.agent_name, reason: 'hmac_failure', error_code: hmacResult.errorCode } });
      return new Response(JSON.stringify({ error: 'unauthorized', code: hmacResult.errorCode, message: hmacResult.errorMessage, transient: hmacResult.transient }), { status: 401, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // 4. Parse and validate payload
    const payload = await req.json();
    if (!payload.public_key || typeof payload.public_key !== 'string') return new Response(JSON.stringify({ error: 'public_key is required (string)' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    if (!payload.key_fingerprint || typeof payload.key_fingerprint !== 'string') return new Response(JSON.stringify({ error: 'key_fingerprint is required (string, SHA256 hex)' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    if (!/^[a-fA-F0-9]{64}$/.test(payload.key_fingerprint)) return new Response(JSON.stringify({ error: 'key_fingerprint must be 64 hex characters (SHA256)' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    const algorithm = payload.algorithm || 'ECDSA-P256-SHA256';
    if (!['ECDSA-P256-SHA256', 'Ed25519', 'RSA-2048-SHA256', 'RSA-2048-XML', 'RSA-2048-CSP'].includes(algorithm)) return new Response(JSON.stringify({ error: 'Invalid algorithm' }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });

    // 5. Verify fingerprint
    const computedFingerprints = await computeAllKeyFingerprints(payload.public_key);
    const providedFp = payload.key_fingerprint.toLowerCase();
    const matchedFingerprint = computedFingerprints.find(entry => entry.fingerprint === providedFp);
    if (!matchedFingerprint) {
      await logSecurityEvent({ supabase, tenantId: agent.tenant_id, ipAddress, endpoint: '/register-agent-key', attackType: 'invalid_input', severity: 'high', blocked: true, details: { agent_name: agent.agent_name, reason: 'key_tampering' } });
      return new Response(JSON.stringify({ error: 'Fingerprint does not match public key content', modes_tried: computedFingerprints.map(e => e.mode) }), { status: 400, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // 6. Check existing key
    const { data: existingKey } = await supabase.from('agent_signing_keys').select('id, version, revoked_at').eq('agent_id', agent.id).eq('key_fingerprint', providedFp).maybeSingle();
    if (existingKey) {
      if (existingKey.revoked_at) return new Response(JSON.stringify({ error: 'This key was previously revoked', key_id: existingKey.id }), { status: 409, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
      return new Response(JSON.stringify({ success: true, message: 'Key already registered', key_id: existingKey.id, version: existingKey.version, already_registered: true }), { status: 200, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
    }

    // 7. Cleanup orphan keys (BUG 6 FIX)
    try {
      const { data: orphanKeys } = await supabase.from('agent_signing_keys').select('id, key_fingerprint, algorithm, created_at').eq('agent_id', agent.id).eq('is_active', true).is('revoked_at', null);
      if (orphanKeys && orphanKeys.length > 1) {
        const sorted = orphanKeys.sort((a: Record<string, string>, b: Record<string, string>) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());
        const toDeactivate = sorted.slice(1).map((k: Record<string, string>) => k.id);
        if (toDeactivate.length > 0) await supabase.from('agent_signing_keys').update({ is_active: false, valid_until: new Date().toISOString() }).in('id', toDeactivate);
      }
    } catch { /* non-fatal */ }

    // 8. Register new key
    const { data: registerResult, error: registerError } = await supabase.rpc('register_agent_signing_key', { p_agent_id: agent.id, p_public_key: payload.public_key, p_fingerprint: providedFp, p_algorithm: algorithm });
    if (registerError) return new Response(JSON.stringify({ error: 'Failed to register key', details: registerError.message }), { status: 500, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });

    const result = registerResult[0] || registerResult;
    logger.info('[register-agent-key] Key registered:', { agent: agent.agent_name, keyId: result.key_id, version: result.version });

    return new Response(JSON.stringify({ success: true, key_id: result.key_id, version: result.version, valid_from: result.valid_from, registered_at: new Date().toISOString(), algorithm }), { status: 201, headers: { ...buildCorsHeaders(origin), 'Content-Type': 'application/json' } });
  } catch (error) {
    logger.error('[register-agent-key] Unexpected error:', error);
    return handleException(error, crypto.randomUUID(), 'register-agent-key');
  }
});
