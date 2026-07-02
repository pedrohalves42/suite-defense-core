/**
 * reliability/errors.ts — R4 implementation of R3-A §5.1 error classification.
 *
 * Deterministic classifier. Inputs restricted to (error, method, idempotent).
 * MUST NOT read wall-clock, tenant, caller identity, or any ambient state.
 */

export type ErrorCategory = 'transient' | 'permanent' | 'unknown';

export interface ClassifiedError {
  readonly category: ErrorCategory;
  readonly status?: number;
  readonly retryAfterMs?: number;
  readonly cause: unknown;
  readonly code?: string;
}

export interface ClassificationContext {
  readonly method: 'GET' | 'HEAD' | 'PUT' | 'DELETE' | 'OPTIONS' | 'POST' | 'PATCH';
  readonly idempotent: boolean;
}

export interface ErrorClassifier {
  (err: unknown, ctx: ClassificationContext): ClassifiedError;
}

// R3-A §5.1 — HTTP status → category (independent of method/idempotency).
// Method/idempotency only gates whether the retry engine acts on a transient.
const PERMANENT_STATUSES = new Set<number>([400, 401, 403, 404, 405, 409, 410, 415, 422, 501]);

function extractStatus(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    const s = anyErr.status ?? anyErr.statusCode ?? anyErr.code;
    if (typeof s === 'number' && s >= 100 && s < 600) return s;
  }
  return undefined;
}

function extractRetryAfterMs(err: unknown): number | undefined {
  if (err && typeof err === 'object') {
    const anyErr = err as Record<string, unknown>;
    const v = anyErr.retryAfterMs;
    if (typeof v === 'number' && v >= 0 && Number.isFinite(v)) return v;
  }
  return undefined;
}

function extractName(err: unknown): string | undefined {
  if (err && typeof err === 'object') {
    const n = (err as { name?: unknown }).name;
    if (typeof n === 'string') return n;
  }
  return undefined;
}

export const defaultClassifier: ErrorClassifier = (err, _ctx) => {
  const status = extractStatus(err);
  const retryAfterMs = extractRetryAfterMs(err);
  const name = extractName(err);

  // Network / timeout classes are transient.
  if (name === 'AbortError' || name === 'TimeoutError') {
    return { category: 'transient', cause: err, code: name, retryAfterMs };
  }

  if (typeof status === 'number') {
    if (status === 408 || status === 425 || status === 429) {
      return { category: 'transient', status, retryAfterMs, cause: err };
    }
    if (status >= 500 && status <= 599) {
      // 501 is permanent (Not Implemented).
      if (status === 501) return { category: 'permanent', status, cause: err };
      return { category: 'transient', status, retryAfterMs, cause: err };
    }
    if (PERMANENT_STATUSES.has(status)) {
      return { category: 'permanent', status, cause: err };
    }
    if (status >= 200 && status < 400) {
      return { category: 'permanent', status, cause: err };
    }
  }

  return { category: 'unknown', status, cause: err, retryAfterMs };
};
