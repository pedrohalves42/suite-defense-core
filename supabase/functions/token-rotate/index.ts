import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

/**
 * Token Rotation Service → SEC-008
 * Hash-only storage, 30-day TTL, 7-day rotation window
 */

const TokenRotateSchema = z.object({
  action: z.enum(['needs-rotation', 'generate', 'validate', 'revoke']).optional(),
  agentId: z.string().uuid().optional(),
  token: z.string().min(1).max(256).optional(),
  hmacSecret: z.string().min(1).max(256).optional(),
  reason: z.string().max(500).optional(),
  tenant_id: z.string().uuid().optional(),
}).passthrough();

const TOKEN_TTL_DAYS = 30;
const ROTATION_WINDOW_DAYS = 7;

async function generateSecureToken(): Promise<string> {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashToken(token: string): Promise<string> {
  const encoder = new TextEncoder();
  const data = encoder.encode(token);
  const hash = await crypto.subtle.digest('SHA-256', data);
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serveTenant(async (req, ctx) => {
  const { supabase, tenantId, userId, requestId, body } = ctx;

  const parsed = TokenRotateSchema.safeParse(body || {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const action = parsed.data.action || (req.method === 'GET' ? 'needs-rotation' : undefined);

  // ??? NEEDS ROTATION ???
  if (action === 'needs-rotation' || req.method === 'GET') {
    const { data: tokens, error } = await supabase
      .from('agent_tokens')
      .select('agent_id, token_id, created_at, expires_at')
      .eq('is_revoked', false)
      .eq('is_active', true)
      .lt('expires_at', new Date(Date.now() + 7 * 24 * 60 * 60 * 1000).toISOString());

    if (error) throw error;

    return {
      needs_rotation: tokens?.length || 0,
      tokens: tokens?.map(t => ({ agentId: t.agent_id, expiresAt: t.expires_at, createdAt: t.created_at })),
    };
  }

  // ??? GENERATE ???
  if (action === 'generate') {
    const { agentId } = parsed.data;
    if (!agentId) {
      return new Response(
        JSON.stringify({ error: 'agentId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const agentToken = await generateSecureToken();
    const hmacSecret = await generateSecureToken();
    const tokenHash = await hashToken(agentToken);
    const hmacHash = await hashToken(hmacSecret);
    const tokenId = crypto.randomUUID();

    const { error: insertError } = await supabase
      .from('agent_tokens')
      .insert({
        token_id: tokenId,
        agent_id: agentId,
        tenant_id: tenantId,
        token_hash: tokenHash,
        hmac_secret_hash: hmacHash,
        expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
        is_active: true,
        is_revoked: false,
      });

    if (insertError) throw insertError;

    logger.info(`[token-rotate][${requestId}] Token generated for agent ${agentId} by user ${userId}`);

    return {
      token: agentToken,
      hmac_secret: hmacSecret,
      token_id: tokenId,
      expires_at: new Date(Date.now() + TOKEN_TTL_DAYS * 24 * 60 * 60 * 1000).toISOString(),
    };
  }

  // ??? VALIDATE ???
  if (action === 'validate') {
    const { agentId, token: agentToken, hmacSecret } = parsed.data;
    if (!agentId || !agentToken) {
      return { valid: false, error: 'agentId and token required' };
    }

    const tokenHash = await hashToken(agentToken);

    const query = supabase
      .from('agent_tokens')
      .select('*')
      .eq('agent_id', agentId)
      .eq('token_hash', tokenHash);

    if (hmacSecret) {
      const hmacHash = await hashToken(hmacSecret);
      query.eq('hmac_secret_hash', hmacHash);
    }

    const { data: storedToken, error } = await query.single();

    if (error || !storedToken) {
      return { valid: false, error: 'Invalid token' };
    }

    if (storedToken.is_revoked) {
      logger.warn(`[SECURITY][${requestId}] Revoked token used for agent ${agentId}`);
      return { valid: false, error: 'Token revoked' };
    }

    if (new Date(storedToken.expires_at) < new Date()) {
      return { valid: false, error: 'Token expired' };
    }

    await supabase.from('agent_tokens').update({ last_used_at: new Date().toISOString() }).eq('id', storedToken.id);

    const age = Date.now() - new Date(storedToken.created_at).getTime();
    const needsRotation = age > (TOKEN_TTL_DAYS - ROTATION_WINDOW_DAYS) * 24 * 60 * 60 * 1000;

    return { valid: true, needs_rotation: needsRotation };
  }

  // ??? REVOKE ???
  if (action === 'revoke') {
    const { agentId, reason } = body;
    if (!agentId) {
      return new Response(
        JSON.stringify({ error: 'agentId required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const { error } = await supabase
      .from('agent_tokens')
      .update({ is_revoked: true, revoked_at: new Date().toISOString(), is_active: false })
      .eq('agent_id', agentId)
      .eq('is_revoked', false);

    if (error) throw error;

    logger.info(`[token-rotate][${requestId}] Tokens revoked for agent ${agentId} by user ${userId}, reason: ${reason}`);

    return { success: true };
  }

  return new Response(
    JSON.stringify({ error: 'Unknown action' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
}, { methods: ['GET', 'POST'] });
