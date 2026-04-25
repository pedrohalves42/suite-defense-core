/**
 * Auth security handlers: check-failed-logins, record-failed-login
 */
import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { fetchWithTimeout, TIMEOUT_TIERS } from '../../_shared/fetch-with-timeout.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const IpAddressSchema = z.string()
  .min(1).max(45)
  .refine(ip => {
    const ipv4 = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6 = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
    return ipv4.test(ip) || ipv6.test(ip) || ip === 'unknown';
  }, 'Invalid IP address format');

const RecordFailedLoginSchema = z.object({
  email: z.string().email().max(255).optional(),
}).passthrough();

function extractIpAddress(req: Request): string {
  return req.headers.get('cf-connecting-ip')?.trim()
    || req.headers.get('x-real-ip')?.trim()
    || req.headers.get('x-forwarded-for')?.split(',')[0]?.trim()
    || 'unknown';
}

export async function handleCheckFailedLogins(
  supabase: any, req: Request, _requestId: string, _payload: Record<string, unknown>,
): Promise<Response | Record<string, unknown>> {
  const rawIp = extractIpAddress(req);
  const ipValidation = IpAddressSchema.safeParse(rawIp);
  if (!ipValidation.success) {
    return new Response(JSON.stringify({ error: 'Invalid request' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }
  const ipAddress = ipValidation.data;
  if (ipAddress === 'unknown') {
    return new Response(JSON.stringify({ error: 'Unable to determine IP address' }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const { data: blockedIp } = await supabase
    .from('ip_blocklist').select('blocked_until')
    .eq('ip_address', ipAddress)
    .gte('blocked_until', new Date().toISOString())
    .order('created_at', { ascending: false }).limit(1).maybeSingle();

  if (blockedIp) {
    return {
      blocked: true, blockedUntil: blockedIp.blocked_until,
      message: 'IP temporariamente bloqueado devido a multiplas tentativas de login falhadas',
      __status: 403,
    };
  }

  const { data: attempts, count } = await supabase
    .from('failed_login_attempts').select('*', { count: 'exact', head: false })
    .eq('ip_address', ipAddress)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  return {
    requiresCaptcha: (count ?? 0) >= 3,
    attemptCount: count ?? 0,
    lastAttempt: attempts?.[0]?.created_at || null,
  };
}

export async function handleRecordFailedLogin(
  supabase: any, req: Request, requestId: string, payload: Record<string, unknown>,
): Promise<Record<string, unknown>> {
  const parsed = RecordFailedLoginSchema.safeParse(payload);
  if (!parsed.success) {
    return { error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors, __status: 400 };
  }

  const ipAddress = extractIpAddress(req);
  const { email } = parsed.data;
  const userAgent = req.headers.get('user-agent');

  if (!ipAddress || ipAddress === 'unknown') {
    return { error: 'Unable to determine IP address', __status: 400 };
  }

  await supabase.from('failed_login_attempts').insert({
    ip_address: ipAddress, email: email || null,
    user_agent: userAgent || null, block_count: 0,
  });

  const { data: blockResult, error: blockError } = await supabase
    .rpc('check_and_block_ip', { p_ip_address: ipAddress, p_email: email || null });

  if (blockError) {
    logger.error(`[record-failed-login][${requestId}] Error checking block status:`, blockError);
  }

  const blockData = blockResult?.[0];

  if (blockData?.is_blocked) {
    logger.info(`[record-failed-login][${requestId}] IP ${ipAddress} blocked until ${blockData.blocked_until}`);

    if (blockData.block_level >= 2) {
      try {
        const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
        const SUPABASE_SERVICE_ROLE_KEY = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!;
        await fetchWithTimeout(`${SUPABASE_URL}/functions/v1/ops-gateway`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'Authorization': `Bearer ${SUPABASE_SERVICE_ROLE_KEY}`,
            'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '',
          },
          body: JSON.stringify({
            action: 'notify:security',
            payload: { ipAddress, email, attemptCount: blockData.attempt_count,
              blockedUntil: blockData.blocked_until, userAgent, blockLevel: blockData.block_level },
          }),
          timeoutMs: TIMEOUT_TIERS.INTERNAL,
        });
      } catch (alertError) {
        logger.error(`[record-failed-login][${requestId}] Failed to send alert:`, alertError);
      }
    }

    return { success: true, blocked: true, blockedUntil: blockData.blocked_until, blockLevel: blockData.block_level };
  }

  return { success: true, blocked: false, attemptCount: blockData?.attempt_count || 0 };
}
