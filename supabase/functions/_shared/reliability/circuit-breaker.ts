/**
 * reliability/circuit-breaker.ts — R4 implementation of R3-B + R3.1 §2.
 *
 * Sliding-window three-state FSM. Buckets ≤ 1s. Permanent errors do NOT
 * count toward the failure ratio. At most one probe in HALF_OPEN.
 */

import { ErrorClassifier, defaultClassifier } from './errors.ts';
import { logger } from '../logger.ts';

export type CircuitState = 'CLOSED' | 'OPEN' | 'HALF_OPEN';

export interface CircuitBreakerOptions {
  readonly name: string;
  readonly windowMs: number;
  readonly bucketMs?: number;
  readonly failureThreshold: number;   // ratio 0..1
  readonly minimumThroughput: number;
  readonly openStateMs: number;
  readonly successThreshold: number;
  readonly classifier?: ErrorClassifier;
  readonly onStateChange?: (from: CircuitState, to: CircuitState) => void;
  readonly requestId?: string;
  readonly traceId?: string;
}

interface Bucket {
  t: number;       // bucket start (ms, aligned)
  ok: number;
  fail: number;
}

export class CircuitBreaker {
  private state: CircuitState = 'CLOSED';
  private buckets: Bucket[] = [];
  private openedAt = 0;
  private halfOpenSuccesses = 0;
  private halfOpenInFlight = false;
  private readonly bucketMs: number;
  private readonly classifier: ErrorClassifier;

  constructor(private readonly opts: CircuitBreakerOptions) {
    if (opts.windowMs < 1000 || opts.windowMs > 60_000) {
      throw new Error('circuit-breaker: windowMs must be within [1000, 60000]');
    }
    const b = opts.bucketMs ?? 1000;
    if (b < 1 || b > 1000) throw new Error('circuit-breaker: bucketMs must be within [1, 1000]');
    if (opts.failureThreshold <= 0 || opts.failureThreshold > 1) {
      throw new Error('circuit-breaker: failureThreshold must be in (0, 1]');
    }
    if (opts.minimumThroughput < 1) throw new Error('circuit-breaker: minimumThroughput >= 1');
    if (opts.openStateMs < 1) throw new Error('circuit-breaker: openStateMs >= 1');
    if (opts.successThreshold < 1) throw new Error('circuit-breaker: successThreshold >= 1');
    this.bucketMs = b;
    this.classifier = opts.classifier ?? defaultClassifier;
  }

  getState(): CircuitState {
    this.maybeTransitionFromOpen();
    return this.state;
  }

  getStats(): Readonly<{ failures: number; successes: number; windowMs: number }> {
    this.evict();
    let ok = 0, fail = 0;
    for (const b of this.buckets) { ok += b.ok; fail += b.fail; }
    return { failures: fail, successes: ok, windowMs: this.opts.windowMs };
  }

  reset(): void {
    this.transition(this.state, 'CLOSED');
    this.buckets = [];
    this.halfOpenSuccesses = 0;
    this.halfOpenInFlight = false;
    this.openedAt = 0;
  }

  async execute<T>(fn: () => Promise<T>): Promise<T> {
    this.maybeTransitionFromOpen();

    if (this.state === 'OPEN') {
      logger.warn?.('reliability.breaker.rejected', {
        requestId: this.opts.requestId,
        traceId: this.opts.traceId,
        name: this.opts.name,
        nextAttemptAt: new Date(this.openedAt + this.opts.openStateMs).toISOString(),
      });
      throw new Error(`CircuitBreaker[${this.opts.name}]: OPEN`);
    }

    if (this.state === 'HALF_OPEN') {
      if (this.halfOpenInFlight) {
        throw new Error(`CircuitBreaker[${this.opts.name}]: HALF_OPEN probe in flight`);
      }
      this.halfOpenInFlight = true;
    }

    try {
      const result = await fn();
      this.onSuccess();
      return result;
    } catch (err) {
      this.onFailure(err);
      throw err;
    } finally {
      if (this.state === 'HALF_OPEN' || this.state === 'OPEN') {
        this.halfOpenInFlight = false;
      } else {
        this.halfOpenInFlight = false;
      }
    }
  }

  // ---------- internals ----------

  private now(): number { return Date.now(); }

  private bucket(): Bucket {
    const t = Math.floor(this.now() / this.bucketMs) * this.bucketMs;
    const last = this.buckets[this.buckets.length - 1];
    if (last && last.t === t) return last;
    const nb: Bucket = { t, ok: 0, fail: 0 };
    this.buckets.push(nb);
    return nb;
  }

  private evict(): void {
    const cutoff = this.now() - this.opts.windowMs;
    while (this.buckets.length && this.buckets[0].t < cutoff) this.buckets.shift();
  }

  private onSuccess(): void {
    this.evict();
    this.bucket().ok++;
    if (this.state === 'HALF_OPEN') {
      this.halfOpenSuccesses++;
      if (this.halfOpenSuccesses >= this.opts.successThreshold) {
        this.transition('HALF_OPEN', 'CLOSED');
        this.buckets = [];
        this.halfOpenSuccesses = 0;
      }
    }
  }

  private onFailure(err: unknown): void {
    // Permanent errors do NOT count.
    const cls = this.classifier(err, { method: 'POST', idempotent: false });
    if (cls.category === 'permanent') return;

    this.evict();
    this.bucket().fail++;

    if (this.state === 'HALF_OPEN') {
      this.openedAt = this.now();
      this.transition('HALF_OPEN', 'OPEN');
      this.halfOpenSuccesses = 0;
      return;
    }

    if (this.state === 'CLOSED') {
      let ok = 0, fail = 0;
      for (const b of this.buckets) { ok += b.ok; fail += b.fail; }
      const total = ok + fail;
      if (total >= this.opts.minimumThroughput) {
        const ratio = fail / total;
        if (ratio >= this.opts.failureThreshold) {
          this.openedAt = this.now();
          this.transition('CLOSED', 'OPEN');
        }
      }
    }
  }

  private maybeTransitionFromOpen(): void {
    if (this.state === 'OPEN' && this.now() - this.openedAt >= this.opts.openStateMs) {
      this.transition('OPEN', 'HALF_OPEN');
      this.halfOpenSuccesses = 0;
      this.halfOpenInFlight = false;
    }
  }

  private transition(from: CircuitState, to: CircuitState): void {
    if (from === to) return;
    this.state = to;
    logger.info?.('reliability.breaker.state', {
      requestId: this.opts.requestId,
      traceId: this.opts.traceId,
      name: this.opts.name,
      from,
      to,
      ...this.getStats(),
    });
    this.opts.onStateChange?.(from, to);
  }
}
