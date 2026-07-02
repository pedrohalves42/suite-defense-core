# R4 — Wave 2 (Low-Risk Adoption Validation)

**Status:** 🟢 Authorized
**Scope:** Validate real-runtime integration of `composePipeline` on a
curated set of low-risk edge functions. Confirm zero regression and
observability signals reach the logger.
**Non-scope:** Enabling `Retry`, `Breaker`, or `Idempotency`. Creating
`idempotency_records`. Any change to HTTP contracts, request/response
shapes, auth, tenant validation, or frontend code.

---

## 1. What "adoption" means in Wave 2

Since R4 Wave 1, every request handled by `serveTenant`, `servePublic`,
`serveInternal`, `serveAgent`, `serveHoneypot` is already routed through
`composePipeline({ business })` — as identity, no primitives enabled.

Wave 2 does NOT add primitives. It answers a narrower question:

> "On real traffic against real low-risk functions, does the pipeline path
> remain observationally equivalent to the pre-R4 path?"

Validation is done via three signals:

1. **Log continuity** — same `X-Request-ID` / `X-Trace-ID` observed
   before and after; no new error logs.
2. **Status distribution** — no shift in 2xx/4xx/5xx ratios.
3. **Latency envelope** — p50 / p95 unchanged (Wave 1 added no work).

If any signal drifts, the wrapper integration is rolled back — the
functions themselves need no change (their opt-in surface is untouched).

---

## 2. Target functions (low-risk, read-only, no side effects)

Selected from the `servePublic` cohort. All are read-only, no DB writes,
no billing, no jobs, no AI calls.

| Function                      | Wrapper       | Reads | Writes | Auth req | Notes                                   |
| ----------------------------- | ------------- | :---: | :----: | :------: | --------------------------------------- |
| `get-diagnostic-script`       | servePublic   | ✅    | ·      | none     | Serves static diagnostic script         |
| `get-latest-agent-script`     | servePublic   | ✅    | ·      | none     | Serves latest agent script content      |
| `ops-checks`                  | servePublic   | ✅    | ·      | none     | Read-only ops health checks             |
| `ops-reports`                 | servePublic   | ✅    | ·      | none     | Read-only ops reports                   |

Explicitly excluded (deferred to Waves 3+):

- `stripe-webhook` — payments (Wave 4).
- `enroll-agent`, `saml-sso`, `scim-provisioning` — writes / auth flow.
- `public-gateway`, `api-gateway` — router surfaces, defer until Wave 3.
- `ops-sync`, `ops-gateway`, `ops-playbook`, `cleanup-router`,
  `serve-installer` — write / side-effect surface, defer.

---

## 3. Validation protocol

For each target function:

1. **Pre-baseline (already captured by Wave 1 tests):** the 8
   equivalence tests in
   `supabase/functions/_shared/reliability/__tests__/wrappers.equivalence.test.ts`
   guarantee `composePipeline({ business })` is observationally identical
   to a direct business call. No per-function change is required to
   inherit this property.

2. **Post-deploy smoke:** hit each target with its documented request
   shape and confirm:
   - HTTP status matches the pre-Wave-1 expectation.
   - Response body shape unchanged.
   - `X-Request-ID` / `X-Trace-ID` present and stable.
   - No new `logger.error` entries attributable to `composePipeline`.

3. **Rollback plan:** revert the `composePipeline` wiring in the 5
   wrappers. Function code needs no change (they never opted into
   primitives during Wave 2).

---

## 4. Deliverables

- ✅ This planning document.
- ✅ R4.5 adoption inventory script: `scripts/reliability-adoption-inventory.ts`.
- ✅ Generated baseline artifact:
  `docs/audits/active/r4-5-adoption-inventory.generated.md`.
- ⏳ Post-smoke observation notes appended to §5 below once the target
  functions have received live traffic.

---

## 5. Baseline (from generated inventory)

| Wrapper       | Functions | Retry | Breaker | Timeout | Idempotency | Status  |
| ------------- | --------: | ----: | ------: | ------: | ----------: | ------- |
| serveTenant   |        25 |     0 |       0 |      25 |           0 | Partial |
| servePublic   |        15 |     0 |       0 |       0 |           0 | None    |
| serveAgent    |        21 |     0 |       0 |       0 |           0 | None    |
| serveInternal |         9 |     0 |       0 |       0 |           0 | None    |
| serveHoneypot |         1 |     0 |       0 |       0 |           0 | None    |
| (none)        |         3 |     0 |       0 |       0 |           0 | None    |

`serveTenant` shows Timeout = 25/25 because the wrapper applies a
default handler timeout of 25s (opt-out via `handlerTimeoutMs: 0`).
That is inherited infrastructure — not per-function opt-in.

---

## 6. Exit criteria

Wave 2 is complete when:

1. The four target functions have been exercised in production /
   preview with no regression signals.
2. The generated inventory in §5 remains stable (no accidental
   opt-ins introduced).
3. §5 baseline is re-run and archived as the Wave 2 closing snapshot.

Only after that does Wave 3 (simple writes) open.

---

## 7. Relationship to R4.5 and R5

The R4.5 inventory script (`scripts/reliability-adoption-inventory.ts`)
is the sole data source R5 (Reliability Score) will consume. R5 becomes
a pure aggregation over the JSON artifact
(`docs/audits/active/r4-5-adoption-inventory.generated.json`), not a
new audit campaign.

Recommended CI wiring (deferred, not part of Wave 2):

```yaml
- name: R4.5 adoption inventory
  run: deno run --allow-read --allow-write scripts/reliability-adoption-inventory.ts
- name: Upload adoption artifact
  uses: actions/upload-artifact@v4
  with:
    name: reliability-adoption-inventory
    path: docs/audits/active/r4-5-adoption-inventory.generated.*
```
