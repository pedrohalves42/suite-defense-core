import { logger } from "./logger.ts";
/**
 * Circuit Breaker + Timeout for AI calls
 * Provides resilience against AI service failures
 */

export interface CircuitBreakerState {
  failures: number;
  lastFailure: number;
  isOpen: boolean;
}

export interface AICallOptions<T = unknown> {
  timeoutMs?: number;
  maxRetries?: number;
  fallbackResponse?: T;
}

const DEFAULT_TIMEOUT_MS = 10000; // 10 seconds
const FAILURE_THRESHOLD = 3;
const RESET_TIMEOUT_MS = 60000; // 1 minute

// In-memory state (resets on cold start, which is acceptable for edge functions)
const circuitState: CircuitBreakerState = {
  failures: 0,
  lastFailure: 0,
  isOpen: false,
};

/**
 * Check if circuit breaker should allow the call
 */
export function shouldAllowCall(): boolean {
  if (!circuitState.isOpen) {
    return true;
  }

  // Check if enough time has passed to try again (half-open state)
  const timeSinceLastFailure = Date.now() - circuitState.lastFailure;
  if (timeSinceLastFailure > RESET_TIMEOUT_MS) {
    logger.info('[CircuitBreaker] Entering half-open state, allowing test call');
    return true;
  }

  logger.info('[CircuitBreaker] Circuit is OPEN, blocking call');
  return false;
}

/**
 * Record a successful call
 */
export function recordSuccess(): void {
  if (circuitState.isOpen) {
    logger.info('[CircuitBreaker] Call succeeded, closing circuit');
  }
  circuitState.failures = 0;
  circuitState.isOpen = false;
}

/**
 * Record a failed call
 */
export function recordFailure(): void {
  circuitState.failures++;
  circuitState.lastFailure = Date.now();

  if (circuitState.failures >= FAILURE_THRESHOLD) {
    circuitState.isOpen = true;
    logger.info(`[CircuitBreaker] Circuit OPENED after ${circuitState.failures} failures`);
  } else {
    logger.info(`[CircuitBreaker] Failure recorded (${circuitState.failures}/${FAILURE_THRESHOLD})`);
  }
}

/**
 * Get current circuit breaker state for monitoring
 */
export function getCircuitState(): CircuitBreakerState {
  return { ...circuitState };
}

/**
 * Execute AI call with timeout
 */
export async function executeWithTimeout<T>(
  fn: () => Promise<T>,
  timeoutMs: number = DEFAULT_TIMEOUT_MS
): Promise<T> {
  const timeoutPromise = new Promise<never>((_, reject) => {
    setTimeout(() => {
      reject(new Error(`AI call timed out after ${timeoutMs}ms`));
    }, timeoutMs);
  });

  return Promise.race([fn(), timeoutPromise]);
}

/**
 * Wrap AI call with circuit breaker and timeout
 */
export async function withCircuitBreaker<T>(
  fn: () => Promise<T>,
  options: AICallOptions<T> = {}
): Promise<{ success: boolean; data?: T; error?: string; usedFallback?: boolean }> {
  const { timeoutMs = DEFAULT_TIMEOUT_MS, fallbackResponse } = options;

  // Check if circuit is open
  if (!shouldAllowCall()) {
    if (fallbackResponse !== undefined) {
      return {
        success: true,
        data: fallbackResponse as T,
        usedFallback: true,
      };
    }
    return {
      success: false,
      error: 'Circuit breaker is open - AI service temporarily unavailable',
    };
  }

  try {
    const result = await executeWithTimeout(fn, timeoutMs);
    recordSuccess();
    return { success: true, data: result };
  } catch (error) {
    recordFailure();
    const errorMessage = error instanceof Error ? error.message : 'Unknown error';
    logger.error('[CircuitBreaker] AI call failed:', errorMessage);

    if (fallbackResponse !== undefined) {
      return {
        success: true,
        data: fallbackResponse as T,
        usedFallback: true,
        error: errorMessage,
      };
    }

    return { success: false, error: errorMessage };
  }
}
