/**
 * reliability/retry.ts — R4 implementation of R3-A.
 *
 * Deterministic retry engine with mandatory jitter and hard budget ceiling.
 * Retries only when the classifier returns 'transient' AND the context is
 * idempotent. 'permanent' and 'unknown' errors propagate immediately.
 */

import {
  ClassificationContext,
  ClassifiedError,
  ErrorClassifier,
  defaultClassifier,
} from './errors.ts';
import { logger } from '../logger.ts';

export interface RetryOptions {
  readonly maxAttempts: number;
  readonly baseDelayMs: number;
  readonly maxDelayMs: number;
  readonly totalBudgetMs: number;
  readonly jitter: 'full' | 'equal';
  readonly classifier?: ErrorClassifier;
  readonly signal?: AbortSignal;
  readonly method: ClassificationContext['method'];
  readonly idempotent: boolean;
  readonly onAttempt?: (info: RetryAttemptInfo) => void;
  readonly requestId?: string;
  readonly traceId?: string;
}

export interface RetryAttemptInfo {
  readonly attempt: number;
  readonly elapsedMs: number;
  readonly remainingBudgetMs: number;
  readonly lastError?: ClassifiedError;
}

function validate(opts: RetryOptions): void {
  if (!Number.isInteger(opts.maxAttempts) || opts.maxAttempts < 1) {
    throw new Error('retry: maxAttempts must be a positive integer');
  }
  if (opts.baseDelayMs < 1) throw new Error('retry: baseDelayMs must be >= 1');
  if (opts.maxDelayMs < opts.baseDelayMs) {
    throw new Error('retry: maxDelayMs must be >= baseDelayMs');
  }
  if (opts.totalBudgetMs < 0) throw new Error('retry: totalBudgetMs must be >= 0');
}

function computeDelay(attempt: number, opts: RetryOptions): number {
  // Deterministic exponential backoff, then jitter.
  const raw = Math.min(opts.baseDelayMs * Math.pow(2, attempt - 1), opts.maxDelayMs);
  const rnd = Math.random();
  if (opts.jitter === 'full') return Math.floor(raw * rnd);
  // equal: half fixed + half random
  return Math.floor(raw / 2 + (raw / 2) * rnd);
}

function sleep(ms: number, signal?: AbortSignal): Promise<void> {
  return new Promise((resolve, reject) => {
    if (signal?.aborted) return reject(new DOMException('Aborted', 'AbortError'));
    const t = setTimeout(() => {
      signal?.removeEventListener('abort', onAbort);
      resolve();
    }, ms);
    const onAbort = () => {
      clearTimeout(t);
      reject(new DOMException('Aborted', 'AbortError'));
    };
    signal?.addEventListener('abort', onAbort, { once: true });
  });
}

export async function withRetry<T>(
  fn: (info: RetryAttemptInfo) => Promise<T>,
  opts: RetryOptions,
): Promise<T> {
  validate(opts);
  const classifier = opts.classifier ?? defaultClassifier;
  const started = Date.now();
  let lastClassified: ClassifiedError | undefined;

  for (let attempt = 1; attempt <= opts.maxAttempts; attempt++) {
    const elapsedMs = Date.now() - started;
    const remainingBudgetMs = Math.max(0, opts.totalBudgetMs - elapsedMs);
    const info: RetryAttemptInfo = { attempt, elapsedMs, remainingBudgetMs, lastError: lastClassified };

    opts.onAttempt?.(info);
    logger.info?.('reliability.retry.attempt', {
      requestId: opts.requestId,
      traceId: opts.traceId,
      attempt,
      elapsedMs,
      remainingBudgetMs,
      errorCategory: lastClassified?.category,
      status: lastClassified?.status,
    });

    try {
      return await fn(info);
    } catch (err) {
      const classified = classifier(err, { method: opts.method, idempotent: opts.idempotent });
      lastClassified = classified;

      // Non-transient: always propagate.
      if (classified.category !== 'transient') throw err;
      // Non-idempotent context: never retry, even on transient.
      if (!opts.idempotent) throw err;
      // Exhausted attempts.
      if (attempt >= opts.maxAttempts) break;

      const delay = classified.retryAfterMs ?? computeDelay(attempt, opts);
      const afterDelayElapsed = Date.now() - started + delay;
      if (afterDelayElapsed >= opts.totalBudgetMs) break;

      await sleep(delay, opts.signal);
    }
  }

  logger.warn?.('reliability.retry.exhausted', {
    requestId: opts.requestId,
    traceId: opts.traceId,
    attempts: opts.maxAttempts,
    totalElapsedMs: Date.now() - started,
    lastCategory: lastClassified?.category,
    lastStatus: lastClassified?.status,
  });

  throw lastClassified?.cause ?? new Error('retry: exhausted without error');
}
