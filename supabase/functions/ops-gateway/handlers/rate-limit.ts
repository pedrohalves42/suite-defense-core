/**
 * rate-limit-check handler — inlined from standalone rate-limit-check function
 */
import { createClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { z } from 'https://esm.sh/zod@3.23.8';

type SB = any;

const BodySchema = z.object({
  identifier: z.string().min(1).max(500),
  endpoint: z.string().min(1).max(200),
  tenant_id: z.string().uuid(),
});

interface RateLimitConfig { maxRequests: number; windowSeconds: number; }

const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  default: { maxRequests: 60, windowSeconds: 60 },
  auth: { maxRequests: 10, windowSeconds: 60 },
  mutation: { maxRequests: 30, windowSeconds: 60 },
  export: { maxRequests: 5, windowSeconds: 300 },
};

export async function handleRateLimitCheck(
  supabase: SB, _requestId: string, payload: Record<string, unknown>,
): Promise<unknown> {
  const parsed = BodySchema.safeParse(payload);
  if (!parsed.success) return { __status: 400, error: 'Invalid input', issues: parsed.error.flatten().fieldErrors };

  const { identifier, endpoint, tenant_id } = parsed.data;

  const category = Object.keys(ENDPOINT_LIMITS).find(k => endpoint.startsWith(k)) || 'default';
  const config = ENDPOINT_LIMITS[category];
  const windowStart = new Date(Date.now() - config.windowSeconds * 1000).toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from('rate_limits')
    .select('id, request_count, blocked_until')
    .eq('identifier', identifier)
    .eq('endpoint', endpoint)
    .eq('tenant_id', tenant_id)
    .gte('window_start', windowStart)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing?.blocked_until) {
    const blockedUntil = new Date(existing.blocked_until);
    if (blockedUntil > new Date()) {
      const retryAfter = Math.ceil((blockedUntil.getTime() - Date.now()) / 1000);
      return { __status: 429, allowed: false, reason: 'rate_limited', retry_after: retryAfter, blocked_until: existing.blocked_until };
    }
  }

  const currentCount = (existing?.request_count || 0) + 1;
  const isBlocked = currentCount > config.maxRequests;

  if (existing) {
    const updateData: Record<string, unknown> = { request_count: currentCount, last_request_at: new Date().toISOString() };
    if (isBlocked) updateData.blocked_until = new Date(Date.now() + config.windowSeconds * 1000).toISOString();
    await supabase.from('rate_limits').update(updateData).eq('id', existing.id);
  } else {
    await supabase.from('rate_limits').insert({
      identifier, endpoint, tenant_id, request_count: 1,
      window_start: new Date().toISOString(), last_request_at: new Date().toISOString(),
      blocked_until: isBlocked ? new Date(Date.now() + config.windowSeconds * 1000).toISOString() : null,
    });
  }

  if (isBlocked) {
    return { __status: 429, allowed: false, reason: 'rate_limited', retry_after: config.windowSeconds };
  }

  return { allowed: true, remaining: config.maxRequests - currentCount, limit: config.maxRequests, window_seconds: config.windowSeconds };
}
