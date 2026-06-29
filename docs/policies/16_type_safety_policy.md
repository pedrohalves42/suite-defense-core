# Policy 16 — Type Safety & Type Escape Governance

**Status:** Active (permanent)
**Effective:** 2026-06-29
**Origin:** Program Closure D2–D19 (see `docs/audits/active/program-closure-d2-d19.md`)
**Supersedes:** ad-hoc tolerance for `@ts-nocheck` / `@ts-ignore` during the D2–D19 cleanup.

This policy converts the disciplines proven during the D2–D19 campaign into
permanent rules. From this date forward, any new occurrence of the patterns
below is treated as a **regression**, not as technical debt.

---

## 1. Prohibited directives — no exceptions

The following directives are **prohibited** anywhere in the production codebase
(`src/**`, `supabase/functions/**`, `contracts/**`, `tools/**`):

- `// @ts-nocheck`
- `/* @ts-nocheck */`
- `// @ts-ignore`
- `/* @ts-ignore */`

There is no "temporary" exemption. A PR that introduces either directive fails:

- **ESLint** (`@typescript-eslint/ban-ts-comment` set to `error` in both
  `eslint.config.js` and `config/eslint.config.js`).
- **CI gate** (`scripts/guard-no-ts-nocheck-tier1.sh`) for the 152 protected
  Tier 1 files. Regex: `^[[:space:]]*(//|/\*)[[:space:]]*@ts-(nocheck|ignore)\b`.

If the underlying type error is genuinely impossible to fix in scope, the only
permitted construct is `// @ts-expect-error <justification ≥ 10 chars>`, which
the compiler will itself remove the moment the underlying error disappears.
This forces the suppression to be self-cleaning.

---

## 2. Type escapes must be justified

Constructs that bypass the type checker at the value level (`as unknown as X`,
`as never`, `as any`, double casts) require an inline justification comment
naming the boundary they cross. Format:

```ts
// type-escape: <category> — <one-line technical reason>
const json = asJson(payload); // type-escape: boundary-json — Supabase Json recursive type
```

Recognized categories (extend via PR review, not unilaterally):

| Category          | When to use                                                              |
| ----------------- | ------------------------------------------------------------------------ |
| `boundary-json`   | Crossing into Postgres `jsonb` / Supabase `Json` recursive union.        |
| `boundary-rpc`    | RPC return types not yet expressible through generated typegen.          |
| `boundary-deno`   | Deno ↔ DOM lib mismatch (e.g. `BufferSource` variance).                  |
| `boundary-vendor` | Third-party library types are incorrect or missing upstream.             |
| `test-fixture`    | Test-only shape narrowing where runtime invariants are asserted nearby.  |

Escapes without a category comment are reviewed as defects.

The canonical containment example is `supabase/functions/_shared/json.ts` —
the single `as unknown as Json` cast in the codebase, fully documented.

---

## 3. Typegen drift is a build failure

`src/integrations/supabase/types.ts` is the single source of truth for the
database schema. `supabase/functions/_shared/database.types.ts` is a
byte-for-byte mirror, never hand-edited.

- **Local:** `.husky/pre-commit` runs `scripts/sync-database-types.sh` and
  re-stages the mirror automatically.
- **CI:** `scripts/guard-database-types-sync.sh` compares SHA256 and fails the
  build on any divergence (workflow `.github/workflows/type-debt-guards.yml`,
  job `database-types-sync`).

Drift is **not** a debt item. It blocks merge.

---

## 4. Architectural fences carried over from D19

Public SQL fachadas created during the campaign are the **only** entry points
for their domain. In particular:

- `check_blast_radius(...)` — the sole entry point for blast-radius checks.
  Direct calls to underlying primitives from new code are rejected in review.
- Any future fachada introduced under this regime inherits the same rule and
  must be documented in `docs/architecture/`.

Polarity for safety-critical RPCs is **fail-closed**. `auto-remediate`'s
HTTP 503 on RPC failure (HF-LATENT-RPC-MISSING-01a) is the reference pattern.

---

## 5. What this policy does **not** cover

- Performance, observability, SLO/SLA, security hardening (F-003/F-005/F-006),
  test coverage. These are tracked under separate functional initiatives. They
  are not extensions of D2–D19 and must not reopen the type-cleanup program.
- The `~1338` Type Escape Index baseline. Escapes are governed by §2 above
  (justification + category), not by a numeric target.

---

## 6. Enforcement summary

| Control                                          | Layer        | Failure mode |
| ------------------------------------------------ | ------------ | ------------ |
| `ban-ts-comment` (`@ts-nocheck` / `@ts-ignore`)  | ESLint       | lint error   |
| `guard-no-ts-nocheck-tier1.sh` (152 files)       | CI + local   | exit 1       |
| `guard-database-types-sync.sh` (SHA256)          | CI + pre-commit | exit 1   |
| `type-escape:` comment convention                | code review  | reject PR    |
| Fachada-only access for governed RPCs            | code review  | reject PR    |

Reviewers are expected to enforce §2 and §4 — tooling cannot detect
unjustified casts or fachada bypass reliably.

---

## 7. Revision

This policy is owned by Engineering. Material changes (e.g. adding a new
escape category, retiring a fachada) require an ADR. Tightening (removing
an allowed category, narrowing scope) does not.
