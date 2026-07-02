/**
 * reliability/pipeline.ts — R4 implementation of R3.1 §4 pipeline order.
 *
 * Frozen runtime order:
 *   Rate Limit -> Idempotency -> Retry (outer) -> Circuit Breaker (inner)
 *   -> Timeout -> Business Logic -> Audit -> Response.
 *
 * Skipping stages is allowed; reordering is not (enforced by API shape).
 */

export interface PipelineStages {
  readonly rateLimit?: (req: Request) => Promise<Response | null>;
  readonly idempotency?: (req: Request) => Promise<Response | null>;
  readonly retry?: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly breaker?: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly timeout?: <T>(fn: () => Promise<T>) => Promise<T>;
  readonly business: (req: Request) => Promise<Response>;
  readonly audit?: (req: Request, res: Response) => Promise<void>;
}

export function composePipeline(stages: PipelineStages): (req: Request) => Promise<Response> {
  if (typeof stages.business !== 'function') {
    throw new Error('composePipeline: business stage is required');
  }

  return async function pipeline(req: Request): Promise<Response> {
    // 1. Rate limit
    if (stages.rateLimit) {
      const early = await stages.rateLimit(req);
      if (early) return early;
    }

    // 2. Idempotency (may short-circuit with replayed / conflict response)
    if (stages.idempotency) {
      const early = await stages.idempotency(req);
      if (early) return early;
    }

    // 3-5. retry(outer) -> breaker(inner) -> timeout -> business
    const run = () => stages.business(req);
    const withTimeout = stages.timeout ? () => stages.timeout!(run) : run;
    const withBreaker = stages.breaker ? () => stages.breaker!(withTimeout) : withTimeout;
    const withRetryStage = stages.retry ? () => stages.retry!(withBreaker) : withBreaker;

    const res = await withRetryStage();

    // 6. Audit (after response, before returning)
    if (stages.audit) {
      try { await stages.audit(req, res); } catch { /* audit MUST NOT break response */ }
    }
    return res;
  };
}
