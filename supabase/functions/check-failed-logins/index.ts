import { servePublic } from '../_shared/serve-tenant.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const IpAddressSchema = z.string()
  .min(1, 'IP address is required')
  .max(45, 'IP address too long')
  .refine(ip => {
    const ipv4Pattern = /^(?:(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)\.){3}(?:25[0-5]|2[0-4][0-9]|[01]?[0-9][0-9]?)$/;
    const ipv6Pattern = /^([0-9a-fA-F]{1,4}:){7}[0-9a-fA-F]{1,4}$|^::1$|^([0-9a-fA-F]{1,4}:)*::([0-9a-fA-F]{1,4}:)*[0-9a-fA-F]{1,4}$/;
    return ipv4Pattern.test(ip) || ipv6Pattern.test(ip) || ip === 'unknown';
  }, 'Invalid IP address format');

function extractIpAddress(req: Request): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xRealIp = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  if (cfConnectingIp) return cfConnectingIp.trim();
  if (xRealIp) return xRealIp.trim();
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  return 'unknown';
}

servePublic(async (req, ctx) => {
  const { supabase, requestId } = ctx;

  const rawIpAddress = extractIpAddress(req);
  const ipValidation = IpAddressSchema.safeParse(rawIpAddress);
  if (!ipValidation.success) {
    return new Response(
      JSON.stringify({ error: 'Invalid request' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const ipAddress = ipValidation.data;

  if (ipAddress === 'unknown') {
    return new Response(
      JSON.stringify({ error: 'Unable to determine IP address' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check if IP is blocked
  const { data: blockedIp } = await supabase
    .from('ip_blocklist')
    .select('blocked_until')
    .eq('ip_address', ipAddress)
    .gte('blocked_until', new Date().toISOString())
    .order('created_at', { ascending: false })
    .limit(1)
    .maybeSingle();

  if (blockedIp) {
    return new Response(
      JSON.stringify({
        blocked: true,
        blockedUntil: blockedIp.blocked_until,
        message: 'IP temporariamente bloqueado devido a multiplas tentativas de login falhadas',
      }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Check failed attempts in last 24h
  const { data: attempts, count } = await supabase
    .from('failed_login_attempts')
    .select('*', { count: 'exact', head: false })
    .eq('ip_address', ipAddress)
    .gte('created_at', new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString())
    .order('created_at', { ascending: false });

  const requiresCaptcha = (count ?? 0) >= 3;

  return {
    requiresCaptcha,
    attemptCount: count ?? 0,
    lastAttempt: attempts?.[0]?.created_at || null,
  };
}, { methods: ['GET', 'POST'] });
