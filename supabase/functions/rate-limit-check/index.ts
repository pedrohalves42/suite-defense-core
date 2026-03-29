import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { logger } from '../_shared/logger.ts';
import { assertInternalCaller } from '../_shared/assert-internal-caller.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-supabase-client-platform, x-supabase-client-platform-version, x-supabase-client-runtime, x-supabase-client-runtime-version",
};

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

Deno.serve(async (req: Request) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }


  // Auth guard: require agent token, authenticated user, or internal caller
  const authError = await assertInternalCaller(req, { allowAuthenticatedUsers: true });
  if (authError) return authError;
  try {
    const { identifier, endpoint, tenant_id } = await req.json();

    if (!identifier || !endpoint || !tenant_id) {
      return new Response(
        JSON.stringify({ error: "Missing required fields: identifier, endpoint, tenant_id" }),
        { status: 400, headers: { ...corsHeaders, "Content-Type": "application/json" } }
      );
    }

    // Determine rate limit config for this endpoint category
    const category = Object.keys(ENDPOINT_LIMITS).find((k) => endpoint.startsWith(k)) || "default";
    const config = ENDPOINT_LIMITS[category];

    const supabaseAdmin = createClient(
      Deno.env.get("SUPABASE_URL")!,
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
    );

    const windowStart = new Date(Date.now() - config.windowSeconds * 1000).toISOString();

    // Check current request count in the sliding window
    const { data: existing, error: fetchError } = await supabaseAdmin
      .from("rate_limits")
      .select("id, request_count, blocked_until")
      .eq("identifier", identifier)
      .eq("endpoint", endpoint)
      .eq("tenant_id", tenant_id)
      .gte("window_start", windowStart)
      .maybeSingle();

    if (fetchError) throw fetchError;

    // Check if currently blocked
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
          {
            status: 429,
            headers: {
              ...corsHeaders,
              "Content-Type": "application/json",
              "Retry-After": String(Math.ceil((blockedUntil.getTime() - Date.now()) / 1000)),
            },
          }
        );
      }
    }

    const currentCount = (existing?.request_count || 0) + 1;
    const isBlocked = currentCount > config.maxRequests;

    if (existing) {
      // Update existing record
      const updateData: Record<string, unknown> = {
        request_count: currentCount,
        last_request_at: new Date().toISOString(),
      };
      if (isBlocked) {
        updateData.blocked_until = new Date(Date.now() + config.windowSeconds * 1000).toISOString();
      }

      await supabaseAdmin
        .from("rate_limits")
        .update(updateData)
        .eq("id", existing.id);
    } else {
      // Insert new record
      await supabaseAdmin.from("rate_limits").insert({
        identifier,
        endpoint,
        tenant_id,
        request_count: 1,
        window_start: new Date().toISOString(),
        last_request_at: new Date().toISOString(),
        blocked_until: isBlocked
          ? new Date(Date.now() + config.windowSeconds * 1000).toISOString()
          : null,
      });
    }

    if (isBlocked) {
      return new Response(
        JSON.stringify({
          allowed: false,
          reason: "rate_limited",
          retry_after: config.windowSeconds,
        }),
        {
          status: 429,
          headers: {
            ...corsHeaders,
            "Content-Type": "application/json",
            "Retry-After": String(config.windowSeconds),
          },
        }
      );
    }

    return new Response(
      JSON.stringify({
        allowed: true,
        remaining: config.maxRequests - currentCount,
        limit: config.maxRequests,
        window_seconds: config.windowSeconds,
      }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  } catch (error) {
    logger.error("Rate limit check error:", error);
    // Fail open ? don't block requests if rate limiter errors
    return new Response(
      JSON.stringify({ allowed: true, error: "Rate limiter unavailable" }),
      { status: 200, headers: { ...corsHeaders, "Content-Type": "application/json" } }
    );
  }
});
