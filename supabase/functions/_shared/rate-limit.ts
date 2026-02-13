import { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

interface RateLimitConfig {
  maxRequests: number;
  windowMinutes: number;
  blockMinutes?: number;
}

const DEFAULT_CONFIG: RateLimitConfig = {
  maxRequests: 60,
  windowMinutes: 1,
  blockMinutes: 5,
};

/**
 * Atomic rate limit check using database RPC.
 * Reduces 2-3 sequential queries to 1 atomic call.
 */
export async function checkRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  endpoint: string,
  config: RateLimitConfig = DEFAULT_CONFIG
): Promise<{ allowed: boolean; remainingRequests?: number; resetAt?: Date }> {
  const { data, error } = await supabase.rpc('check_rate_limit_atomic', {
    p_identifier: identifier,
    p_endpoint: endpoint,
    p_max_requests: config.maxRequests,
    p_window_minutes: config.windowMinutes,
    p_block_minutes: config.blockMinutes ?? 5,
  });

  if (error) {
    // Fail open on RPC error to avoid blocking legitimate requests
    console.error('[RateLimit] RPC error, failing open:', error.message);
    return { allowed: true, remainingRequests: config.maxRequests };
  }

  const result = data as { allowed: boolean; remaining?: number; reset_at?: string; reason?: string };

  if (!result.allowed) {
    return {
      allowed: false,
      resetAt: result.reset_at ? new Date(result.reset_at) : undefined,
    };
  }

  return {
    allowed: true,
    remainingRequests: result.remaining ?? 0,
  };
}
