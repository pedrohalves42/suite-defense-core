/**
 * record-failed-login - Records failed login attempts and manages IP blocking
 * Migrated to servePublic middleware (pre-auth, no JWT required)
 */
import { servePublic } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const RecordFailedLoginSchema = z.object({
  email: z.string().email().max(255).optional(),
}).passthrough();

function extractIpAddress(req: Request): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xRealIp = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  return 'unknown';
}

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;

  const parsed = RecordFailedLoginSchema.safeParse(ctx.body || {});
  if (!parsed.success) {
    return new Response(JSON.stringify({ error: 'Invalid payload', issues: parsed.error.flatten().fieldErrors }), { status: 400, headers: { 'Content-Type': 'application/json' } });
  }

  const ipAddress = extractIpAddress(req);
  const { email } = parsed.data;
  const userAgent = req.headers.get('user-agent');

  if (!ipAddress || ipAddress === 'unknown') {
    return new Response(
      JSON.stringify({ error: 'Unable to determine IP address' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Record failed attempt
  await supabase.from('failed_login_attempts').insert({
    ip_address: ipAddress, email: email || null,
    user_agent: userAgent || null, block_count: 0,
  });

  // Progressive blocking
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
        await supabase.functions.invoke('notification-dispatcher', {
          headers: { 'X-Internal-Secret': Deno.env.get('INTERNAL_FUNCTION_SECRET') || '' },
          body: {
            ipAddress, email, attemptCount: blockData.attempt_count,
            blockedUntil: blockData.blocked_until, userAgent, blockLevel: blockData.block_level,
          },
        });
      } catch (alertError) {
        logger.error(`[record-failed-login][${requestId}] Failed to send alert:`, alertError);
      }
    }

    return { success: true, blocked: true, blockedUntil: blockData.blocked_until, blockLevel: blockData.block_level };
  }

  return { success: true, blocked: false, attemptCount: blockData?.attempt_count || 0 };
}, { methods: ['POST'] });
