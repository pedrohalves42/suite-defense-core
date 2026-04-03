/**
 * fetch-with-timeout.ts
 * 
 * Drop-in replacement for fetch() with mandatory timeout.
 * Prevents worker hangs from slow/unresponsive external services.
 * 
 * Tiered defaults (per backend-request-timeout-policy):
 *  - AI providers: 15s (default)
 *  - Payment (Stripe): 10s
 *  - Internal function-to-function: 8s
 *  - Webhooks: 5s
 */

import { logger } from './logger.ts';

/** Pre-defined timeout tiers in milliseconds */
export const TIMEOUT_TIERS = {
  AI: 15_000,
  STRIPE: 10_000,
  INTERNAL: 8_000,
  WEBHOOK: 5_000,
  DEFAULT: 15_000,
} as const;

export async function fetchWithTimeout(
  url: string | URL,
  options: RequestInit & { timeoutMs?: number } = {}
): Promise<Response> {
  const { timeoutMs = TIMEOUT_TIERS.DEFAULT, ...fetchOptions } = options;

  try {
    return await fetch(url, {
      ...fetchOptions,
      signal: fetchOptions.signal ?? AbortSignal.timeout(timeoutMs),
    });
  } catch (error) {
    // Convert AbortError / TimeoutError into a structured log + rethrow
    if (error instanceof DOMException && (error.name === 'AbortError' || error.name === 'TimeoutError')) {
      logger.warn(`[fetchWithTimeout] Request to ${String(url).substring(0, 80)} timed out after ${timeoutMs}ms`);
    }
    throw error;
  }
}
