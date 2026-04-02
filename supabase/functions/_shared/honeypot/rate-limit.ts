/**
 * Honeypot rate limit — bucket-based atomic upsert.
 * 
 * Uses check_honeypot_rate_limit_v2 RPC:
 * - No count(*) scan on historical data
 * - Atomic upsert into minute-buckets
 * - Separate blocks table for fast block check
 * - Fail-closed: if RPC fails, deny the request
 */

import type { SupabaseClient } from 'https://esm.sh/@supabase/supabase-js@2.74.0';
import { hashIp } from './sanitize.ts';

export interface HoneypotRateLimitConfig {
  maxRequests: number;
  bucketSeconds: number;
  blockSeconds: number;
}

const DEFAULT_CONFIG: HoneypotRateLimitConfig = {
  maxRequests: 5,
  bucketSeconds: 60,
  blockSeconds: 900, // 15 minutes
};

/**
 * Check if a request is allowed by the honeypot rate limiter.
 * Identifier is hashed before storage (privacy-safe).
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
    // Hash identifier for storage
    const identifierHash = await hashIp(identifier);

    const { data, error } = await supabase.rpc('check_honeypot_rate_limit_v2', {
      p_identifier_hash: identifierHash,
      p_max_requests: cfg.maxRequests,
      p_bucket_seconds: cfg.bucketSeconds,
      p_block_seconds: cfg.blockSeconds,
    });

    if (error) {
      console.error('[honeypot-rate-limit] RPC error (fail-closed):', error.message);
      return false;
    }

    return data === true;
  } catch (err) {
    console.error('[honeypot-rate-limit] Exception (fail-closed):', err);
    return false;
  }
}
