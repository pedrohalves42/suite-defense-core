/**
 * change-password handler — inlined from standalone change-password function
 * Note: Uses service_role client for admin.updateUserById and creates a
 * user-context client to verify current password.
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { logger } from '../../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';
import type { HandlerContext } from './admin.ts';

type SB = ReturnType<typeof createClient>;

const ChangePasswordSchema = z.object({
  current_password: z.string().min(1, 'Current password is required'),
  new_password: z.string()
    .min(8, 'Password must be at least 8 characters')
    .max(72, 'Password must be at most 72 characters')
    .regex(/[a-z]/, 'Must contain a lowercase letter')
    .regex(/[A-Z]/, 'Must contain an uppercase letter')
    .regex(/\d/, 'Must contain a number')
    .regex(/[!@#$%^&*(),.?":{}|<>]/, 'Must contain a special character'),
});

// In-memory rate limiting (resets on function restart)
const rateLimitMap = new Map<string, { count: number; resetAt: number }>();
const MAX_ATTEMPTS = 5;
const WINDOW_MS = 15 * 60 * 1000;

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

export async function handleChangePassword(
  supabase: SB, requestId: string, payload: Record<string, unknown>, ctx?: HandlerContext,
): Promise<unknown> {
  const userId = ctx?.userId;
  const req = ctx?.req;
  if (!userId) return { __status: 401, error: 'Authorization required' };

  if (!checkRateLimitLocal(userId)) {
    logger.warn(`[change-password][${requestId}] Rate limit exceeded for user ${userId}`);
    return { __status: 429, error: 'Too many attempts. Try again in 15 minutes.' };
  }

  const parsed = ChangePasswordSchema.safeParse(payload);
  if (!parsed.success) {
    return { __status: 400, error: 'Validation failed', details: parsed.error.flatten().fieldErrors };
  }

  const { current_password: currentPassword, new_password: newPassword } = parsed.data;

  // Create user-context client to verify current password
  const authHeader = req?.headers.get('Authorization');
  if (!authHeader) return { __status: 401, error: 'Missing Authorization header' };

  const SUPABASE_URL = Deno.env.get('SUPABASE_URL')!;
  const SUPABASE_ANON_KEY = Deno.env.get('SUPABASE_ANON_KEY')!;

  const supabaseClient = createClient<any>(SUPABASE_URL, SUPABASE_ANON_KEY, {
    global: { headers: { Authorization: authHeader } },
  });

  const { data: { user } } = await supabaseClient.auth.getUser();
  if (!user?.email) return { __status: 400, error: 'Could not resolve user email' };

  // Verify current password
  const { error: signInError } = await supabaseClient.auth.signInWithPassword({
    email: user.email, password: currentPassword,
  });

  if (signInError) {
    logger.warn(`[change-password][${requestId}] Invalid current password for user ${userId}`);

    const { data: userRole } = await supabase.from('user_roles').select('tenant_id').eq('user_id', userId).limit(1).maybeSingle();
    if (userRole?.tenant_id) {
      await supabase.from('audit_logs').insert({
        tenant_id: userRole.tenant_id, user_id: userId, actor_id: userId,
        action: 'change_password_failed', resource_type: 'user', resource_id: userId,
        success: false, details: { reason: 'invalid_current_password' },
      });
    }

    return { __status: 400, error: 'Current password is incorrect' };
  }

  // Update password via Admin API
  const { error: updateError } = await supabase.auth.admin.updateUserById(userId, { password: newPassword });
  if (updateError) {
    logger.error(`[change-password][${requestId}] Failed to update password`, updateError as Error);
    return { __status: 500, error: 'Failed to update password' };
  }

  // Audit log for success
  const { data: userRole } = await supabase.from('user_roles').select('tenant_id').eq('user_id', userId).limit(1).maybeSingle();
  if (userRole?.tenant_id) {
    await supabase.from('audit_logs').insert({
      tenant_id: userRole.tenant_id, user_id: userId, actor_id: userId,
      action: 'change_password', resource_type: 'user', resource_id: userId,
      success: true, details: { timestamp: new Date().toISOString() },
    });
  }

  logger.info(`[change-password][${requestId}] Password changed for user ${userId}`);
  return { success: true, message: 'Password updated successfully' };
}
