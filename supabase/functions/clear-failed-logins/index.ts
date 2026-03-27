/**
 * Clear Failed Logins
 * Clears brute-force protection after successful login
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

function extractIpAddress(req: Request): string {
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  const xRealIp = req.headers.get('x-real-ip');
  const xForwardedFor = req.headers.get('x-forwarded-for');
  
  if (cfConnectingIp) return cfConnectingIp;
  if (xRealIp) return xRealIp;
  if (xForwardedFor) return xForwardedFor.split(',')[0].trim();
  return 'unknown';
}

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId } = ctx;

  const ipAddress = extractIpAddress(req);

  if (!ipAddress || ipAddress === 'unknown') {
    return new Response(
      JSON.stringify({ error: 'Unable to determine IP address' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[clear-failed-logins][${requestId}] Clearing for IP: ${ipAddress}, user: ${userId}`);

  await supabase
    .from('failed_login_attempts')
    .delete()
    .eq('ip_address', ipAddress);

  await supabase
    .from('ip_blocklist')
    .delete()
    .eq('ip_address', ipAddress);

  return { success: true };
}, {
  skipTenantValidation: true,
  methods: ['POST'],
});
