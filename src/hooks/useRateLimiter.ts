import { useRef, useCallback } from "react";

interface RateLimiterOptions {
  /** Max calls allowed in the window */
  maxCalls?: number;
  /** Time window in milliseconds */
  windowMs?: number;
}

/**
 * Frontend rate limiter for mutations.
 * Prevents excessive API calls from rapid user interactions.
 */
export function useRateLimiter({ maxCalls = 5, windowMs = 10000 }: RateLimiterOptions = {}) {
  const callTimestamps = useRef<number[]>([]);

  const checkLimit = useCallback((): boolean => {
    const now = Date.now();
    // Remove expired timestamps
    callTimestamps.current = callTimestamps.current.filter(t => now - t < windowMs);
    
    if (callTimestamps.current.length >= maxCalls) {
      return false; // Rate limited
    }

    callTimestamps.current.push(now);
    return true; // Allowed
  }, [maxCalls, windowMs]);

  const remainingCalls = useCallback((): number => {
    const now = Date.now();
    const active = callTimestamps.current.filter(t => now - t < windowMs);
    return Math.max(0, maxCalls - active.length);
  }, [maxCalls, windowMs]);

  const reset = useCallback(() => {
    callTimestamps.current = [];
  }, []);

  return { checkLimit, remainingCalls, reset };
}
