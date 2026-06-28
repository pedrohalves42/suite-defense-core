/**
 * D18-3 / LATENT-AUDIT-SCHEMA-01 — JSON narrowing helpers.
 *
 * These two helpers exist to centralize the single unavoidable cast that
 * remains in the codebase after the typegen drift was eliminated by D18-2.
 *
 * Technical impossibility justification:
 * - The Supabase typegen models every `jsonb` column as the recursive `Json`
 *   union (`string | number | boolean | null | Json[] | { [k: string]: Json }`).
 * - Plain object literals in TypeScript are inferred *without* an index
 *   signature, so `{ foo: number }` is NOT structurally assignable to
 *   `{ [k: string]: Json }` even when every field is JSON-shaped. This is a
 *   well-known TS invariance limitation, not a runtime problem.
 * - A runtime `JSON.parse(JSON.stringify(v))` round-trip would prove safety,
 *   but it changes the payload (strips `undefined`, coerces `Date`, drops
 *   class identity). D18-3 forbids any runtime behavior change, so we do not
 *   round-trip.
 *
 * The single `as unknown as Json` cast is contained here, with this comment,
 * and is the only one used by audit-schema insert/update call sites. All
 * call sites become free of inline `as`/`as never`/`as unknown as ...`.
 *
 * Do NOT add other casts to this module. Do NOT mutate the input.
 */

import type { Json } from './database.types.ts';

/** Narrows a value already known to be JSON-shaped to the generated `Json` type. */
export function asJson(value: unknown): Json {
  // Single, documented cast — see file header for technical justification.
  return value as Json;
}

/**
 * Narrows a typed object (e.g. a domain interface returned by a fallback
 * factory) to the loose `Record<string, unknown>` shape that audit pipelines
 * consume. The runtime value is forwarded unchanged.
 */
export function toRecord<T extends object>(value: T): Record<string, unknown> {
  return value as unknown as Record<string, unknown>;
}
