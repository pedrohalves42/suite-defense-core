/**
 * reliability/telemetry.ts — frozen event names for R4.
 *
 * Emission happens through the shared logger inside each primitive; this
 * module exports the constants so tests and adopters use identical strings.
 */

export const RELIABILITY_EVENTS = {
  RETRY_ATTEMPT:        'reliability.retry.attempt',
  RETRY_EXHAUSTED:      'reliability.retry.exhausted',
  BREAKER_STATE:        'reliability.breaker.state',
  BREAKER_REJECTED:     'reliability.breaker.rejected',
  IDEMPOTENCY_HIT:      'reliability.idempotency.hit',
  IDEMPOTENCY_EXPIRED:  'reliability.idempotency.expired',
} as const;

export type ReliabilityEvent = typeof RELIABILITY_EVENTS[keyof typeof RELIABILITY_EVENTS];
