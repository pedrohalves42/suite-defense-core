/**
 * Honeypot rate limit wrapper.
 * Uses the check_honeypot_rate_limit RPC for atomic rate limiting.
 * Fail-closed: if the RPC fails, deny the request.
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';

export interface HoneypotRateLimitConfig {
  maxRequests: number;
  windowMinutes: number;
  blockMinutes: number;
}

const DEFAULT_CONFIG: HoneypotRateLimitConfig = {
  maxRequests: 5,
  windowMinutes: 1,
  blockMinutes: 15,
};

/**
 * Check if a request is allowed by the honeypot rate limiter.
 * Returns true if allowed, false if rate limited.
 * Fail-closed: returns false on errors.
 */
export async function checkHoneypotRateLimit(
  supabase: SupabaseClient,
  identifier: string,
  config?: Partial<HoneypotRateLimitConfig>,
): Promise<boolean> {
  const cfg = { ...DEFAULT_CONFIG, ...config };

  try {
    const { data, error } = await supabase.rpc('check_honeypot_rate_limit', {
      p_identifier: identifier,
      p_max_requests: cfg.maxRequests,
      p_window_minutes: cfg.windowMinutes,
      p_block_minutes: cfg.blockMinutes,
    });

    if (error) {
      console.error('[honeypot-rate-limit] RPC error (fail-closed):', error.message);
      return false; // Fail-closed
    }

    return data === true;
  } catch (err) {
    console.error('[honeypot-rate-limit] Exception (fail-closed):', err);
    return false; // Fail-closed
  }
}
