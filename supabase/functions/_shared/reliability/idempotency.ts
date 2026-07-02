/**
 * reliability/idempotency.ts — R4 implementation of R3-C + R3.1 §3.
 *
 * Deterministic payload canonicalization (JSON keys sorted lexicographically,
 * NFC-normalized strings, shortest round-trip numbers). Non-JSON bodies use
 * raw byte SHA-256.
 */

import { logger } from '../logger.ts';

export interface IdempotencyKey {
  readonly scope: string;
  readonly key: string;
}

export interface StoredIdempotencyRecord {
  readonly fingerprint: string;
  readonly responseBody: string;
  readonly responseStatus: number;
  readonly responseHeaders: Readonly<Record<string, string>>;
  readonly createdAt: string;
  readonly expiresAt: string;
}

export interface IdempotencyStore {
  get(k: IdempotencyKey): Promise<StoredIdempotencyRecord | null>;
  put(k: IdempotencyKey, rec: StoredIdempotencyRecord): Promise<'inserted' | 'exists'>;
}

export interface IdempotencyOptions {
  readonly key: IdempotencyKey;
  readonly body: unknown;
  readonly retentionMs: number;      // 24h..30d
  readonly store: IdempotencyStore;
  readonly toStored?: (value: unknown) => Omit<StoredIdempotencyRecord, 'fingerprint' | 'createdAt' | 'expiresAt'>;
  readonly requestId?: string;
  readonly traceId?: string;
}

export type IdempotencyOutcome<T> =
  | { readonly kind: 'executed'; readonly value: T; readonly stored: StoredIdempotencyRecord }
  | { readonly kind: 'replayed'; readonly stored: StoredIdempotencyRecord }
  | { readonly kind: 'conflict'; readonly stored: StoredIdempotencyRecord };

const MIN_RETENTION_MS = 24 * 60 * 60 * 1000;
const MAX_RETENTION_MS = 30 * 24 * 60 * 60 * 1000;

// ---------- canonicalization (R3.1 §3) ----------

function canonicalizeNumber(n: number): string {
  if (!Number.isFinite(n)) throw new Error('canonical: non-finite number');
  // JSON's shortest round-trip is the default JS `String(n)` for finite numbers.
  return String(n);
}

function canonicalizeString(s: string): string {
  return JSON.stringify(s.normalize('NFC'));
}

function canonicalize(v: unknown): string {
  if (v === null) return 'null';
  if (typeof v === 'boolean') return v ? 'true' : 'false';
  if (typeof v === 'number') return canonicalizeNumber(v);
  if (typeof v === 'string') return canonicalizeString(v);
  if (Array.isArray(v)) return '[' + v.map(canonicalize).join(',') + ']';
  if (typeof v === 'object') {
    const keys = Object.keys(v as Record<string, unknown>).sort();
    return '{' + keys.map(k =>
      canonicalizeString(k) + ':' + canonicalize((v as Record<string, unknown>)[k])
    ).join(',') + '}';
  }
  throw new Error(`canonical: unsupported type ${typeof v}`);
}

async function sha256Hex(input: Uint8Array): Promise<string> {
  // deno-lint-ignore no-explicit-any
  const digest = await crypto.subtle.digest('SHA-256', input as any);
  return Array.from(new Uint8Array(digest)).map(b => b.toString(16).padStart(2, '0')).join('');
}

export async function canonicalFingerprint(body: unknown): Promise<string> {
  if (body instanceof Uint8Array) return sha256Hex(body);
  const canonical = canonicalize(body);
  return sha256Hex(new TextEncoder().encode(canonical));
}

// ---------- withIdempotency ----------

export async function withIdempotency<T>(
  fn: () => Promise<T>,
  opts: IdempotencyOptions,
): Promise<IdempotencyOutcome<T>> {
  if (opts.retentionMs < MIN_RETENTION_MS || opts.retentionMs > MAX_RETENTION_MS) {
    throw new Error(`idempotency: retentionMs out of range [24h, 30d]`);
  }
  if (!opts.key.scope || !opts.key.key) {
    throw new Error('idempotency: scope and key are required');
  }

  const fingerprint = await canonicalFingerprint(opts.body);

  const existing = await opts.store.get(opts.key);
  if (existing) {
    if (existing.fingerprint === fingerprint) {
      logger.info?.('reliability.idempotency.hit', {
        requestId: opts.requestId,
        traceId: opts.traceId,
        scope: opts.key.scope,
        outcome: 'replayed',
        fingerprint8: fingerprint.slice(0, 8),
      });
      return { kind: 'replayed', stored: existing };
    }
    logger.warn?.('reliability.idempotency.hit', {
      requestId: opts.requestId,
      traceId: opts.traceId,
      scope: opts.key.scope,
      outcome: 'conflict',
      fingerprint8: fingerprint.slice(0, 8),
    });
    return { kind: 'conflict', stored: existing };
  }

  const value = await fn();

  const now = Date.now();
  const projection = opts.toStored?.(value) ?? {
    responseBody: JSON.stringify(value),
    responseStatus: 200,
    responseHeaders: {},
  };
  const rec: StoredIdempotencyRecord = {
    fingerprint,
    ...projection,
    createdAt: new Date(now).toISOString(),
    expiresAt: new Date(now + opts.retentionMs).toISOString(),
  };

  const put = await opts.store.put(opts.key, rec);
  if (put === 'exists') {
    // Racing writer won; re-read authoritative record.
    const winner = await opts.store.get(opts.key);
    if (winner) {
      if (winner.fingerprint === fingerprint) {
        return { kind: 'replayed', stored: winner };
      }
      return { kind: 'conflict', stored: winner };
    }
  }

  logger.info?.('reliability.idempotency.hit', {
    requestId: opts.requestId,
    traceId: opts.traceId,
    scope: opts.key.scope,
    outcome: 'executed',
    fingerprint8: fingerprint.slice(0, 8),
  });

  return { kind: 'executed', value, stored: rec };
}
