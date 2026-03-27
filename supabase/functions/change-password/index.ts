/**
 * Change Password - Migrated to serveTenant middleware
 * Note: Uses skipTenantValidation since this is user-scoped, not tenant-scoped.
 * Creates a user-context client internally for signInWithPassword verification.
 */

import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { serveTenant } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { requireEnv } from '../_shared/env.ts';

// Rate limiting per user (in-memory, resets on function restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000; // 15 minutes

function checkRateLimitLocal(userId: string): boolean {
  const now = Date.now();
  const entry = rateLimitMap.get(userId);

  if (!entry || now > entry.resetAt) {
    rateLimitMap.set(userId, { count: 1, resetAt: now + WINDOW_MS });
    return true;
  }

  if (entry.count >= MAX_ATTEMPTS) return false;
  entry.count++;
  return true;
}

serveTenant(async (req, ctx) => {
  const { supabase, userId, requestId, body } = ctx;

  if (!userId) {
    return new Response(
      JSON.stringify({ error: 'Authorization required' }),
      { status: 401, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Rate limiting
  if (!checkRateLimitLocal(userId)) {
    logger.warn(`[change-password][${requestId}] Rate limit exceeded for user ${userId}`);
    return new Response(
      JSON.stringify({ error: 'Too many attempts. Try again in 15 minutes.' }),
      { status: 429, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate payload
  const currentPassword = body?.current_password;
  const newPassword = body?.new_password;

  if (!currentPassword || !newPassword) {
    return new Response(
      JSON.stringify({ error: 'Current password and new password are required' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Validate new password strength
  const passwordRegex = /^(?=.*[a-z])(?=.*[A-Z])(?=.*\d)(?=.*[!@#$%^&*(),.?":{}|<>]).{8,72}$/;
  if (!passwordRegex.test(newPassword)) {
    return new Response(
      JSON.stringify({ error: 'New password must be 8-72 characters with uppercase, lowercase, number and special character' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Create user-context client to verify current password
  const authHeader = req.headers.get('Authorization')!;
  const supabaseClient = createClient(
    requireEnv('SUPABASE_URL'),
    requireEnv('SUPABASE_ANON_KEY'),
    { global: { headers: { Authorization: authHeader } } }
  );

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user?.email) {
    return new Response(
      JSON.stringify({ error: 'Could not resolve user email' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Verify current password
  const { error: signInError } = await supabaseClient.auth.signInWithPassword({
    email: user.email,
    password: currentPassword,
  });

  if (signInError) {
    logger.warn(`[change-password][${requestId}] Invalid current password for user ${userId}`);

    // Get tenant for audit
    const { data: userRole } = await supabase
      .from('user_roles')
      .select('tenant_id')
      .eq('user_id', userId)
      .limit(1)
      .maybeSingle();

    if (userRole?.tenant_id) {
      await supabase.from('audit_logs').insert({
        tenant_id: userRole.tenant_id,
        user_id: userId,
        actor_id: userId,
        action: 'change_password_failed',
        resource_type: 'user',
        resource_id: userId,
        success: false,
        details: { reason: 'invalid_current_password' },
      });
    }

    return new Response(
      JSON.stringify({ error: 'Current password is incorrect' }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Update password via Admin API
  const { error: updateError } = await supabase.auth.admin.updateUserById(
    userId,
    { password: newPassword }
  );

  if (updateError) {
    logger.error(`[change-password][${requestId}] Failed to update password`, updateError as Error);
    return new Response(
      JSON.stringify({ error: 'Failed to update password' }),
      { status: 500, headers: { 'Content-Type': 'application/json' } }
    );
  }

  // Audit log for success
  const { data: userRole } = await supabase
    .from('user_roles')
    .select('tenant_id')
    .eq('user_id', userId)
    .limit(1)
    .maybeSingle();

  if (userRole?.tenant_id) {
    await supabase.from('audit_logs').insert({
      tenant_id: userRole.tenant_id,
      user_id: userId,
      actor_id: userId,
      action: 'change_password',
      resource_type: 'user',
      resource_id: userId,
      success: true,
      details: { timestamp: new Date().toISOString() },
    });
  }

  logger.info(`[change-password][${requestId}] Password changed for user ${userId}`);

  return { success: true, message: 'Password updated successfully' };
}, {
  methods: ['POST'],
  skipTenantValidation: true,
});
