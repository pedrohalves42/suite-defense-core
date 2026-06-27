/**
 * HF-JOBS-PAYLOAD-HASH-01 — Single source of truth for `jobs.payload_hash`.
 *
 * Policy
 * ------
 * `jobs.payload_hash` is populated by the DB trigger `trg_auto_set_job_payload_hash`
 * (BEFORE INSERT) via `public.calculate_payload_hash(payload jsonb)`:
 *
 *     SELECT encode(sha256(convert_to(p_payload::text, 'UTF8')), 'hex');
 *
 * The trigger only fires when `NEW.payload_hash IS NULL`. Edge functions MUST NOT
 * compute or send `payload_hash` themselves — that would (a) duplicate logic and
 * (b) risk divergence with the canonical Postgres jsonb text representation used
 * by `calculate_payload_hash`.
 *
 * The generated `Database` types mark `payload_hash` as required (NOT NULL, no
 * default visible to information_schema). This helper centralises the cast so
 * call sites do not have to scatter `as never` / `as any` workarounds — keeping
 * the policy auditable in one place.
 *
 * Replaces (unifies):
 *   - LATENT-AI-04        (ai-router/handlers/execute-solution.ts)
 *   - LATENT-AUTOMATION-03 (auto-remediate/index.ts)
 *
 * Frontend equivalent: `src/lib/job-utils.ts#calculatePayloadHash` is used only
 * when the browser needs the hash *before* insertion (e.g. for client-side
 * deduplication preview). It is NOT authoritative — the DB trigger is.
 */

// Loose row shape: anything the caller wants to insert into `jobs`.
// We intentionally accept a permissive shape and let Postgres reject malformed
// rows; this helper's only job is to encode the payload_hash policy.
export type JobInsertRow = Record<string, unknown>;

/**
 * Prepares a single jobs row for insert: strips any caller-supplied
 * `payload_hash` so the DB trigger always wins, then casts to the type
 * supabase-js expects.
 */
export function jobInsert<T extends JobInsertRow>(row: T): T {
  if ('payload_hash' in row) {
    // Defensive: do not let callers bypass the trigger.
    const { payload_hash: _ignored, ...rest } = row as T & { payload_hash?: unknown };
    return rest as unknown as T;
  }
  return row;
}

/**
 * Batch variant: same policy applied per row.
 */
export function jobInsertMany<T extends JobInsertRow>(rows: T[]): T[] {
  return rows.map(jobInsert);
}
