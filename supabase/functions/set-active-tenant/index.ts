/**
 * Set Active Tenant - ADR-026: Atomic tenant switch endpoint
 * Migrated to serveTenant middleware
 */

import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';

function extractClientIp(req: Request): string {
  const forwardedFor = req.headers.get('x-forwarded-for');
  if (forwardedFor) return forwardedFor.split(',')[0].trim();
  const realIp = req.headers.get('x-real-ip');
  if (realIp) return realIp.trim();
  const cfConnectingIp = req.headers.get('cf-connecting-ip');
  if (cfConnectingIp) return cfConnectingIp.trim();
  return '127.0.0.1';
}

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Unauthorized' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  logger.info(`[set-active-tenant][${requestId}] User ${userId} requesting tenant switch`);

  // ADR-026 P1.1: IP Whitelist Check for Super Admin
  const clientIp = extractClientIp(req);

  const { data: ipAllowed, error: ipCheckError } = await supabase.rpc('check_super_admin_ip_access', {
    _user_id: userId,
    _ip_address: clientIp
  });

  if (ipCheckError) {
    logger.warn(`[set-active-tenant][${requestId}] IP check error`);
  } else if (ipAllowed === false) {
    logger.warn(`[set-active-tenant][${requestId}] User ${userId} blocked: IP not in whitelist`);
    try {
      await supabase.from('audit_logs').insert({
        user_id: userId,
        action: 'super_admin_ip_blocked',
        target_type: 'security',
        details: { ip_address: clientIp, user_agent: req.headers.get('user-agent'), timestamp: new Date().toISOString() }
      });
    } catch { /* non-blocking */ }

    return new Response(
      JSON.stringify({ error: 'IP not authorized for super admin access', code: 'IP_BLOCKED' }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  const tenant_id = body?.tenant_id;
  if (!tenant_id) {
    return new Response(
      JSON.stringify({ error: 'tenant_id is required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // ADR-026: Atomic RPC to verify access AND collect tenant data
  const { data: switchResult, error: switchError } = await supabase
    .rpc('switch_tenant_atomic', { p_user_id: userId, p_new_tenant_id: tenant_id });

  if (switchError) {
    logger.error(`[set-active-tenant][${requestId}] Atomic switch RPC error`, switchError as Error);
    return new Response(
      JSON.stringify({ error: 'Failed to verify tenant access' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  if (!switchResult?.success) {
    const errorCode = switchResult?.error || 'TENANT_ACCESS_DENIED';
    const errorMessage = switchResult?.message || 'Tenant access denied';

    if (errorCode === 'CONCURRENT_MODIFICATION') {
      return new Response(
        JSON.stringify({ error: errorMessage, retry: true }),
        { status: 409, headers: { 'Content-Type': 'application/json' } }
      );
    }

    return new Response(
      JSON.stringify({ error: errorMessage }),
      { status: 403, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Get user for app_metadata
  // Note: We need the user object to preserve existing app_metadata
  const authHeader = req.headers.get('Authorization')!;
  const { createClient } = await import('https://esm.sh/@supabase/supabase-js@2.74.0');
  const userClient = createClient(
    Deno.env.get('SUPABASE_URL')!,
    Deno.env.get('SUPABASE_ANON_KEY')!,
    { global: { headers: { Authorization: authHeader } } }
  );
  const { data: { user } } = await userClient.auth.getUser();
  const previousTenantId = user?.app_metadata?.active_tenant_id;

  // Update user app_metadata
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: {
      ...user?.app_metadata,
      active_tenant_id: switchResult.active_tenant_id,
      tenants: switchResult.tenants,
      is_super_admin: switchResult.is_super_admin,
    },
  });

  if (updateError) {
    logger.error(`[set-active-tenant][${requestId}] Failed to update user metadata`, updateError as Error);
    return new Response(
      JSON.stringify({ error: 'Failed to update session' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Audit log
  if (previousTenantId !== tenant_id) {
    try {
      await supabase.from('audit_logs').insert({
        tenant_id,
        user_id: userId,
        action: 'tenant_switched',
        target_type: 'tenant',
        target_id: tenant_id,
        details: { previous_tenant_id: previousTenantId, new_tenant_id: tenant_id, timestamp: new Date().toISOString(), atomic_switch: true },
      });
    } catch { /* non-blocking */ }
  }

  logger.info(`[set-active-tenant][${requestId}] Successfully switched user ${userId} to tenant ${tenant_id}`);

  return {
    success: true,
    active_tenant_id: switchResult.active_tenant_id,
    tenants: switchResult.tenants,
    is_super_admin: switchResult.is_super_admin,
    tenant_count: switchResult.tenant_count,
  };
}, {
  skipTenantValidation: true,
});
