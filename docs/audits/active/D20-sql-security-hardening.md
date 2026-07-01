# D20 — SQL Security Hardening

Status: **In progress** (D20-A + D20-B ✅ · D20-C/D/E pending)
Owner: Platform Security
Opened: 2026-07-01

## D20-A — SECURITY DEFINER Audit ✅

### Inventory (public schema)

| Metric | Count |
|---|---|
| Total `SECURITY DEFINER` functions | 438 |
| With explicit `SET search_path` | **438** |
| Without `search_path` | **0** |

Distribution of `search_path` values:

| Value | Count |
|---|---|
| `public, pg_catalog, pg_temp` | 436 |
| `public, extensions, pg_catalog, pg_temp` | 1 |
| `public` | 1 |

The residual `search_path=public` (single value only, no `pg_catalog`, no
`pg_temp`) is a hardened form and is *safe* — it makes the resolution strictly
explicit. No corrective migration is required.

### Guard

- `tools/tests/assert_security_definer_search_path.sql`
  Fails CI if any `public.*` function is created with `SECURITY DEFINER`
  without an explicit `SET search_path`.

### Outcome

D20-A closed at inventory time: no offending functions found. The guard
prevents regression from any future migration.

---

## D20-B — HMAC / Token Timing Safety ✅

### Scope of scan

Full sweep of `supabase/functions/**` for direct `===` / `!==` comparisons of
security-sensitive strings (`hmac`, `signature`, `hash`, `digest`, `token`,
`secret`).

### Findings

| # | File | Verdict |
|---|---|---|
| 1 | `_shared/token-hash.ts:25` — `computedHash === storedHash` | **Fixed** — routed through `timingSafeEqual` |
| 2 | `submit-job-result/security.ts:202` — `job.payload_hash !== execution.payload_hash` | **Accepted** — both operands are trusted server-side records fetched from the DB; not a remote-input timing channel |
| 3 | `public-gateway/handlers/fido2-auth.ts:159-162` — challenge compares | **Accepted for this pass** — WebAuthn challenge is a session nonce, not a secret. Flagged for D20-C review. |

### Change applied

- `supabase/functions/_shared/token-hash.ts` now imports the audited
  `timingSafeEqual` primitive and uses it in `validateTokenHash`. Both operands
  are hex-encoded SHA-256 digests (fixed 64 chars), so the length channel is
  already closed; the change eliminates the byte-by-byte channel too.

### API compatibility

Signature unchanged (`validateTokenHash(token, storedHash): Promise<boolean>`).
No caller changes required.

### Benchmark note

`timingSafeEqual` in `_shared/crypto-utils.ts` compares by XOR-accumulating
byte differences over the full length of the longer input. For a 64-char hex
digest the delta over `===` is under a microsecond — irrelevant for
heartbeat/token paths that already do a SHA-256 digest (~5-15 µs) upstream.

---

## D20-C — RLS Review (pending)

Planned scope:
- Inventory `USING (true)` / `WITH CHECK (true)` policies.
- Classify each: (a) intentional public data, (b) admin-only + defended
  elsewhere, (c) unnecessary — remove.
- Publish justification table under `docs/audits/active/D20-C-rls-inventory.md`.

## D20-D — RPC Security Review (pending)

Apply the discipline of `HF-RPC-OVERLOAD-AUDIT-01` platform-wide:
- Enumerate all overloaded RPCs and confirm aridity is disambiguating.
- Verify GRANTs on every RPC exposed to `anon` / `authenticated`.
- Confirm `SECURITY DEFINER` RPCs enforce tenant scoping internally, not just
  via the caller.

## D20-E — Permanent Gates (pending)

To land alongside D20-C/D closure:
- Extend `assert_security_definer_search_path.sql` into the CI matrix.
- Add `assert_no_permissive_policies_outside_allowlist.sql`.
- Add `assert_hmac_uses_timing_safe.sh` (regex gate over edge functions).

---

## Governance

- Type-safety and DB-hardening policies from
  `docs/policies/16_type_safety_policy.md` remain in force. D20 adds security
  posture on top; it does not relax any existing rule.
- All D20 sub-blocks require an entry in this file with the same
  Findings/Change/Guard structure before closing.
