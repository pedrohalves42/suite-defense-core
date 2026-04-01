/**
 * Rate Limit Check - Migrated to serveInternal middleware
 * Auth: Internal only (called by other edge functions)
 */
import { serveInternal } from '../_shared/serve-tenant.ts';
import { logger } from '../_shared/logger.ts';
import { z } from 'https://esm.sh/zod@3.23.8';

const BodySchema = z.object({
  identifier: z.string().min(1).max(500),
  endpoint: z.string().min(1).max(200),
  tenant_id: z.string().uuid(),
});

interface RateLimitConfig {
  maxRequests: number;
  windowSeconds: number;
}

const ENDPOINT_LIMITS: Record<string, RateLimitConfig> = {
  default: { maxRequests: 60, windowSeconds: 60 },
  auth: { maxRequests: 10, windowSeconds: 60 },
  mutation: { maxRequests: 30, windowSeconds: 60 },
  export: { maxRequests: 5, windowSeconds: 300 },
};

serveInternal(async (_req, ctx) => {
  const { supabase, body } = ctx;
  const parsed = BodySchema.safeParse(body);
  if (!parsed.success) {
    return new Response(
      JSON.stringify({ error: "Invalid input", issues: parsed.error.flatten().fieldErrors }),
      { status: 400, headers: { 'Content-Type': 'application/json' } }
    );
  }
  const { identifier, endpoint, tenant_id } = parsed.data;

  const category = Object.keys(ENDPOINT_LIMITS).find((k) => endpoint.startsWith(k)) || "default";
  const config = ENDPOINT_LIMITS[category];
  const windowStart = new Date(Date.now() - config.windowSeconds * 1000).toISOString();

  const { data: existing, error: fetchError } = await supabase
    .from("rate_limits")
    .select("id, request_count, blocked_until")
    .eq("identifier", identifier)
    .eq("endpoint", endpoint)
    .eq("tenant_id", tenant_id)
    .gte("window_start", windowStart)
    .maybeSingle();

  if (fetchError) throw fetchError;

  if (existing?.blocked_until) {
    const blockedUntil = new Date(existing.blocked_until);
    if (blockedUntil > new Date()) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "rate_limited",
          retry_after: Math.ceil((blockedUntil.getTime() - Date.now()) / 1000),
          blocked_until: existing.blocked_until,
        }),
        { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(Math.ceil((blockedUntil.getTime() - Date.now()) / 1000)) } }
      );
    }
  }

  const currentCount = (existing?.request_count || 0) + 1;
  const isBlocked = currentCount > config.maxRequests;

  if (existing) {
    const updateData: Record<string, unknown> = {
      request_count: currentCount,
      last_request_at: new Date().toISOString(),
    };
    if (isBlocked) {
      updateData.blocked_until = new Date(Date.now() + config.windowSeconds * 1000).toISOString();
    }
    await supabase.from("rate_limits").update(updateData).eq("id", existing.id);
  } else {
    await supabase.from("rate_limits").insert({
      identifier, endpoint, tenant_id,
      request_count: 1,
      window_start: new Date().toISOString(),
      last_request_at: new Date().toISOString(),
      blocked_until: isBlocked ? new Date(Date.now() + config.windowSeconds * 1000).toISOString() : null,
    });
  }

  if (isBlocked) {
    return new Response(
      JSON.stringify({ allowed: false, reason: "rate_limited", retry_after: config.windowSeconds }),
      { status: 429, headers: { 'Content-Type': 'application/json', 'Retry-After': String(config.windowSeconds) } }
    );
  }

  return { allowed: true, remaining: config.maxRequests - currentCount, limit: config.maxRequests, window_seconds: config.windowSeconds };
});
