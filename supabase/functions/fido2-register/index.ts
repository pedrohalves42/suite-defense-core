import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

/**
 * FIDO2/WebAuthn Registration Edge Function
 * Actions: begin, complete, keys (list), revoke
 */

const RP_ID = Deno.env.get('FIDO2_RP_ID') || 'cybershield-audit.lovable.app';
const RP_NAME = 'CyberShield Security Platform';

const Fido2BeginSchema = z.object({
  action: z.literal('begin').default('begin'),
  deviceName: z.string().min(1).max(255),
});

const Fido2CompleteSchema = z.object({
  action: z.literal('complete'),
  registrationResponse: z.object({
    id: z.string().min(1).max(2048),
    response: z.object({
      clientDataJSON: z.string().min(1),
      transports: z.array(z.string().max(32)).max(10).optional(),
    }).passthrough(),
  }).passthrough(),
  expectedChallenge: z.string().min(1).max(512),
});

const Fido2KeysListSchema = z.object({
  action: z.literal('keys'),
  credentialId: z.undefined().optional(),
});

const Fido2RevokeSchema = z.object({
  action: z.literal('keys'),
  credentialId: z.string().min(1).max(2048),
});

function generateChallenge(): string {
  const bytes = new Uint8Array(32);
  crypto.getRandomValues(bytes);
  return Array.from(bytes).map(b => b.toString(16).padStart(2, '0')).join('');
}

async function hashData(data: string): Promise<string> {
  const encoder = new TextEncoder();
  const hash = await crypto.subtle.digest('SHA-256', encoder.encode(data));
  return Array.from(new Uint8Array(hash)).map(b => b.toString(16).padStart(2, '0')).join('');
}

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  const action = body.action || 'begin';

  // ??? LIST KEYS ???
  if (action === 'keys' && !body.credentialId) {
    const listParsed = Fido2KeysListSchema.safeParse(body);
    if (!listParsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid payload', issues: listParsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const { data: credentials, error } = await supabase
      .from('fido2_credentials')
      .select('credential_id, device_name, created_at, last_used_at, aaguid, backed_up')
      .eq('user_id', userId)
      .eq('is_revoked', false)
      .order('created_at', { ascending: false });

    if (error) throw error;
    return credentials || [];
  }

  // ??? REVOKE KEY ???
  if (action === 'keys' && body.credentialId) {
    const revokeParsed = Fido2RevokeSchema.safeParse(body);
    if (!revokeParsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid payload', issues: revokeParsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const { error } = await supabase
      .from('fido2_credentials')
      .update({ is_revoked: true, revoked_at: new Date().toISOString() })
      .eq('user_id', userId)
      .eq('credential_id', revokeParsed.data.credentialId);

    if (error) throw error;
    logger.info(`[fido2-register][${requestId}] Credential revoked: ${revokeParsed.data.credentialId} by user ${userId}`);
    return { success: true };
  }

  // ??? BEGIN REGISTRATION ???
  if (action === 'begin') {
    const beginParsed = Fido2BeginSchema.safeParse(body);
    if (!beginParsed.success) {
      return new Response(JSON.stringify({ error: 'Invalid payload', issues: beginParsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
    }
    const { deviceName } = beginParsed.data;

    const challenge = generateChallenge();

    // Store challenge temporarily
    const challengeKey = `fido2:register:${userId}:${challenge}`;
    await supabase.from('session_store').upsert({
      key: challengeKey,
      value: { userId, deviceName, createdAt: new Date().toISOString() },
      expires_at: new Date(Date.now() + 5 * 60 * 1000).toISOString(),
    });

    // Get user email for registration options
    const { data: { user: authUser } } = await supabase.auth.admin.getUserById(userId!);

    const options = {
      challenge,
      rp: { id: RP_ID, name: RP_NAME },
      user: {
        id: userId,
        name: authUser?.email || userId,
        displayName: authUser?.user_metadata?.full_name || authUser?.email?.split('@')[0] || 'User',
      },
      pubKeyCredParams: [
        { type: 'public-key', alg: -7 },   // ES256
        { type: 'public-key', alg: -257 },  // RS256
      ],
      authenticatorSelection: {
        residentKey: 'required',
        userVerification: 'required',
        authenticatorAttachment: 'cross-platform',
      },
      attestation: 'none',
      timeout: 60000,
    };

    logger.info(`[fido2-register][${requestId}] Registration started for user ${userId}, device: ${deviceName}`);
    return options;
  }

  // ??? COMPLETE REGISTRATION ???
  if (action === 'complete') {
    const { registrationResponse, expectedChallenge } = body;
    if (!registrationResponse || !expectedChallenge) {
      return new Response(
        JSON.stringify({ error: 'registrationResponse and expectedChallenge required' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const challengeKey = `fido2:register:${userId}:${expectedChallenge}`;
    const { data: storedData } = await supabase
      .from('session_store')
      .select('value')
      .eq('key', challengeKey)
      .single();

    if (!storedData) {
      return new Response(
        JSON.stringify({ error: 'Invalid or expired challenge' }),
        { status: 400, headers: { 'Content-Type': 'application/json' } }
      );
    }

    const stored = storedData.value as { userId: string; deviceName: string };
    const credentialHash = await hashData(registrationResponse.id);

    const { error: insertError } = await supabase
      .from('fido2_credentials')
      .insert({
        user_id: userId,
        credential_id: registrationResponse.id,
        public_key: new TextEncoder().encode(registrationResponse.response.clientDataJSON),
        sign_count: 0,
        device_name: stored.deviceName,
        transports: registrationResponse.response.transports || [],
        aaguid: credentialHash.slice(0, 36),
        attestation_type: 'none',
        backed_up: false,
      });

    if (insertError) throw insertError;

    // Cleanup challenge
    await supabase.from('session_store').delete().eq('key', challengeKey);

    logger.info(`[fido2-register][${requestId}] Registration completed for user ${userId}`);
    return { success: true, credentialId: registrationResponse.id };
  }

  return new Response(
    JSON.stringify({ error: 'Unknown action' }),
    { status: 400, headers: { 'Content-Type': 'application/json' } }
  );
}, { methods: ['POST', 'GET'] });
