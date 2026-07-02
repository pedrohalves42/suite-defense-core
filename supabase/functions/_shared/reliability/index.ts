/**
 * reliability/index.ts — public surface for R4 primitives.
 *
 * Additive only. Nothing outside this directory is modified in R4.
 */

export * from './errors.ts';
export * from './retry.ts';
export * from './circuit-breaker.ts';
export * from './idempotency.ts';
export * from './pipeline.ts';
export * from './telemetry.ts';
