
/**
 * fido2-authenticate handler — Inlined into public-gateway (Phase 6D)
 * WebAuthn authentication: begin (get options) and complete (verify assertion).
 */
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

const RP_ID = Deno.env.get('FIDO2_RP_ID') || 'cybershield-audit.lovable.app';
const ORIGIN = Deno.env.get('FIDO2_ORIGIN') || 'https://cybershield-audit.lovable.app';

const BeginSchema = z.object({
  action: z.literal('begin'),
  email: z.string().email('Valid email required'),
});

const CompleteSchema = z.object({
  action: z.literal('complete'),
  email: z.string().email(),
  authResponse: z.object({
    id: z.string(),
    response: z.object({
      clientDataJSON: z.string(),
      authenticatorData: z.string(),
    }),
  }),
  expectedChallenge: z.string().min(1),
});

function base64UrlDecode(base64url: string): Uint8Array {
  const base64 = base64url.replace(/-/g, '+').replace(/_/g, '/');
  const pad = base64.length % 4;
  const padded = pad ? base64 + '='.repeat(4 - pad) : base64;
  const binary = atob(padded);
  const bytes = new Uint8Array(binary.length);
  for (let i = 0; i < binary.length; i++) bytes[i] = binary.charCodeAt(i);
  return bytes;
}

export async function handleFido2Authenticate(
  supabase: any,
  _req: Request,
  requestId: string,
  payload: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const action = (payload.action as string) || 'begin';

  // ═══ BEGIN AUTHENTICATION ═══
  if (action === 'begin') {
    const parsed = BeginSchema.safeParse(payload);
    if (!parsed.success) {
      return { error: 'Invalid input', details: parsed.error.flatten().fieldErrors, __status: 400 };
    }

    const { email } = parsed.data;

    const { data: { users }, error: listError } = await supabase.auth.admin.listUsers();
    if (listError) throw listError;

    const user = users?.find(u => u.email === email);
    if (!user) {
      return { error: 'No account found with this email', __status: 404 };
    }

    const { data: credentials, error: credError } = await supabase
      .from('fido2_credentials')
      .select('credential_id, transports')
      .eq('user_id', user.id)
      .eq('is_revoked', false);

    if (credError) throw credError;

    if (!credentials || credentials.length === 0) {
      return { error: 'No security keys registered for this account', __status: 400 };
    }

    const challengeBytes = new Uint8Array(32);
    crypto.getRandomValues(challengeBytes);
    const challenge = Array.from(challengeBytes).map(b => b.toString(16).padStart(2, '0')).join('');

    const challengeKey = `fido2:auth:${user.id}:${challenge}`;
    await supabase.from('session_store').upsert({
      key: challengeKey,
      value: { userId: user.id, email: user.email, createdAt: new Date().toISOString() },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    logger.info(`[fido2-authenticate][${requestId}] Begin for ${email}, ${credentials.length} key(s)`);
    return {
      challenge,
      rpId: RP_ID,
      allowCredentials: credentials.map((cred: Record<string, unknown>) => ({
        id: cred.credential_id,
        type: 'public-key',
        transports: cred.transports || [],
      })),
      userVerification: 'required',
      timeout: 60000,
    };
  }

  // ═══ COMPLETE AUTHENTICATION ═══
  if (action === 'complete') {
    const parsed = CompleteSchema.safeParse(payload);
    if (!parsed.success) {
      return { error: 'Invalid input', details: parsed.error.flatten().fieldErrors, __status: 400 };
    }

    const { email, authResponse, expectedChallenge } = parsed.data;

    const { data: { users } } = await supabase.auth.admin.listUsers();
    const user = users?.find(u => u.email === email);
    if (!user) {
      return { error: 'User not found', __status: 404 };
    }

    const challengeKey = `fido2:auth:${user.id}:${expectedChallenge}`;
    const { data: storedData } = await supabase
      .from('session_store')
      .select('value, expires_at')
      .eq('key', challengeKey)
      .single();

    if (!storedData) {
      return { error: 'Invalid or expired challenge', __status: 400 };
    }

    if (new Date(storedData.expires_at) < new Date()) {
      await supabase.from('session_store').delete().eq('key', challengeKey);
      return { error: 'Challenge expired', __status: 400 };
    }

    const { data: credential, error: credError } = await supabase
      .from('fido2_credentials')
      .select('id, user_id, credential_id, public_key, sign_count, transports, is_revoked, created_at')
      .eq('user_id', user.id)
      .eq('credential_id', authResponse.id)
      .eq('is_revoked', false)
      .single();

    if (credError || !credential) {
      return { error: 'Credential not found or revoked', __status: 400 };
    }

    // Verify clientDataJSON
    try {
      const clientDataBytes = base64UrlDecode(authResponse.response.clientDataJSON);
      const clientData = JSON.parse(new TextDecoder().decode(clientDataBytes));

      if (clientData.type !== 'webauthn.get') throw new Error('Invalid clientData type');

      if (clientData.origin !== ORIGIN) {
        logger.warn(`[fido2-authenticate] Origin mismatch: ${clientData.origin} vs ${ORIGIN}`);
        if (!clientData.origin.includes('lovable.app')) throw new Error('Origin mismatch');
      }

      const receivedChallenge = clientData.challenge;
      if (receivedChallenge !== expectedChallenge) {
        const hexChallenge = Array.from(base64UrlDecode(receivedChallenge))
          .map((b: number) => b.toString(16).padStart(2, '0')).join('');
        if (hexChallenge !== expectedChallenge) throw new Error('Challenge mismatch');
      }
    } catch (verifyError) {
      logger.error('[fido2-authenticate] ClientData verification failed:', verifyError);
      return { error: `Authentication verification failed: ${(verifyError as Error).message}`, __status: 400 };
    }

    // Verify authenticatorData flags
    const authDataBytes = base64UrlDecode(authResponse.response.authenticatorData);
    if (authDataBytes.length < 37) {
      return { error: 'Invalid authenticator data', __status: 400 };
    }

    const flags = authDataBytes[32];
    const userPresent = (flags & 0x01) !== 0;
    const userVerified = (flags & 0x04) !== 0;

    if (!userPresent) {
      return { error: 'User presence flag not set', __status: 400 };
    }

    const signCount = (authDataBytes[33] << 24) | (authDataBytes[34] << 16) | (authDataBytes[35] << 8) | authDataBytes[36];

    // Clone detection
    if (credential.sign_count > 0 && signCount <= credential.sign_count) {
      logger.error(`[fido2-authenticate] SECURITY: Possible cloned authenticator for ${credential.credential_id}`);

      const { data: userRoleData } = await supabase
        .from('user_roles').select('tenant_id').eq('user_id', user.id).limit(1).single();

      await supabase.from('security_events').insert({
        tenant_id: userRoleData?.tenant_id,
        severity: 'critical',
        event_type: 'fido2_cloned_authenticator',
        details: {
          user_id: user.id, credential_id: credential.credential_id,
          expected_sign_count: credential.sign_count, received_sign_count: signCount,
        },
      });

      return { error: 'Security alert: authenticator may have been cloned', __status: 403 };
    }

    await supabase.from('fido2_credentials')
      .update({ sign_count: signCount, last_used_at: new Date().toISOString() })
      .eq('id', credential.id);

    await supabase.from('session_store').delete().eq('key', challengeKey);

    const { data: linkData, error: linkError } = await supabase.auth.admin.generateLink({
      type: 'magiclink',
      email: user.email!,
    });

    if (linkError || !linkData) {
      logger.error('[fido2-authenticate] Failed to generate session link:', linkError);
      return { error: 'Failed to create session', __status: 500 };
    }

    const { data: userRole } = await supabase
      .from('user_roles').select('tenant_id').eq('user_id', user.id).limit(1).maybeSingle();

    if (userRole?.tenant_id) {
      await supabase.from('audit_logs').insert({
        tenant_id: userRole.tenant_id, user_id: user.id,
        action: 'fido2_authentication_success', resource_type: 'auth',
        resource_id: credential.credential_id,
        details: { user_verified: userVerified, sign_count: signCount, device_name: credential.device_name },
      });
    }

    logger.info(`[fido2-authenticate][${requestId}] Success for ${email}`);

    return {
      success: true,
      token_hash: linkData.properties?.hashed_token,
      email: user.email,
    };
  }

  return { error: 'Unknown action. Use "begin" or "complete"', __status: 400 };
}