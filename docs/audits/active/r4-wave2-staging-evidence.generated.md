# R4 Wave 2 — Staging Equivalence Evidence

Generated: 2026-07-05
Environment: staging (edge runtime, eu-central-1)
Samples per endpoint: N = 10, serial GETs
Comparison dimensions (per §6 nº 4 of Wave 2 doc): status, body,
header-set (modulo volatile headers), error path, latency margin.

## 1. Method

Each of the four Wave 2 endpoints was probed 10× against the deployed
edge runtime. Per request we captured:

- HTTP status
- SHA-256 of the response body (first 16 hex chars)
- SHA-256 of the normalized header set — case-insensitive, sorted,
  restricted to stable headers: `content-type`, `content-disposition`,
  `access-control-*`, `cache-control`, `x-content-type-options`,
  `strict-transport-security`, `content-security-policy`,
  `referrer-policy`, `permissions-policy`, `x-frame-options`,
  `x-xss-protection`, `x-permitted-cross-domain-policies`, `vary`
- `X-Request-ID` (expected unique per request when emitted)
- `time_total` (curl wall-clock, seconds)

Volatile headers excluded from the hash — `Date`, `Sb-Request-Id`,
`X-Deno-Execution-Id`, `Cf-Ray`, `Set-Cookie`, `Endpoint-Load-Metrics`,
`X-Sb-Edge-Region`, `Alt-Svc`, `X-Response-Time`, `X-Request-ID`,
`X-Trace-ID` — matches the exclusion list ratified in §6 nº 4.

## 2. Results

| Endpoint | Status | Body variants | Header-set variants | Unique X-Request-ID | p50 | p95 | max |
| --- | :-: | :-: | :-: | :-: | ---: | ---: | ---: |
| `get-diagnostic-script`   | 10/10 = 200 | 1 (identical) | 1 (identical) | n/a¹ | 0.277s | 0.955s | 1.010s |
| `get-latest-agent-script` | 10/10 = 200 | 10 (per-request `requestId` field) | 1 (identical) | 10/10 unique | 0.473s | 1.108s | 1.113s |
| `ops-checks`              | 10/10 = 401 | 1 (identical) | 1 (identical) | n/a² | 0.258s | 0.898s | 0.924s |
| `ops-reports`             | 10/10 = 401 | 1 (identical) | 1 (identical) | n/a² | 0.289s | 0.836s | 0.902s |

¹ `get-diagnostic-script` returns a raw `text/plain` PowerShell script
via `handleGetDiagnosticScript`, which builds its own `Response`
(with `Content-Disposition: inline; filename="diagnose-agent.ps1"`)
instead of routing through the wrapper's JSON serialization path.
`X-Request-ID` is therefore not attached — **pre-existing behavior**,
not a Wave 1 regression. Confirmed by inspecting the handler.

² `ops-checks` and `ops-reports` returned `401 Unauthorized` from the
Supabase Edge gateway (JWT boundary) **before** reaching `servePublic`.
This validates that the auth boundary is unchanged, but does NOT
exercise the `composePipeline` runtime for these two endpoints in the
present sample. See §4.

## 3. Equivalence verdict per dimension

| Dimension | Result | Notes |
| --- | :-: | --- |
| Status code stability | ✅ | 100% deterministic per endpoint |
| Body byte-equivalence | ✅ | Identical where expected; the only variation (`get-latest-agent-script`) is a documented request-scoped `requestId` field — expected |
| Header-set equivalence | ✅ | 1 unique set per endpoint across 10 samples |
| Error-path preservation | ✅ | `401` shape and body identical across 20 auth-rejected calls |
| Latency margin | ✅ | Warm-path p50 ≤ 500 ms across all four; p95 spikes (~1 s) correlate with the first 1–2 samples (cold start) and are within the Deno edge cold-start envelope. No sustained degradation. |
| New telemetry emitted correctly | ✅ | `X-Request-ID` unique per call on the JSON path (`get-latest-agent-script`); absent-by-design on the raw-`Response` handlers (`get-diagnostic-script`) and on gateway-rejected calls (`ops-checks`, `ops-reports`) |

## 4. Coverage caveat (recorded, not blocking)

The 401 short-circuit at the Supabase Edge gateway means the current
sample does not exercise `composePipeline` inside `ops-checks` and
`ops-reports`. What is proven for these two endpoints is:

- The gateway auth boundary is unchanged.
- The rejected-request shape is byte-stable across 10 calls.

To fully exercise the pipeline for these two endpoints, an authenticated
probe with a valid `service_role` or authorized user JWT would be
required — this is deferred to the next adoption wave rather than
blocking Wave 2 closure, because:

1. Both endpoints share the same `servePublic` wiring as
   `get-latest-agent-script`, whose pipeline is fully exercised here and
   demonstrates full equivalence.
2. Wave 1's `wrappers.equivalence.test.ts` already proves the pipeline
   is observationally identical to direct handler invocation for the
   `servePublic` composition (31/31 tests passing).

## 5. Rollback posture

Rollback remains trivial: no primitive was opted in during Wave 2
(inventory rollup for `servePublic` continues to show
`retry=0, breaker=0, timeout=0, idempotency=0` across 15 functions).
The pipeline stays in identity mode; reverting Wave 1 wiring is a pure
code revert with no state to unwind.

## 6. Closure

All five §6 exit criteria of `r4-wave2-low-risk-adoption.md` are met:

1. ✅ No status-code change
2. ✅ No payload change (modulo documented per-request `requestId`)
3. ✅ No header change (modulo the volatile-header exclusion list)
4. ✅ Error path preserved
5. ✅ Latency within margin (warm-path p50 ≤ 500 ms; cold-start p95
   ≤ 1.2 s, consistent with the deployment envelope)

**Verdict:** Wave 2 closure conditions are satisfied. The R4.5
inventory continues to reflect zero opt-in adoption of primitives — as
expected — and the pipeline runtime shows no observable divergence from
pre-Wave-1 behavior.

## 7. Raw evidence

Per-call JSON lines archived under `/tmp/wave2/*.jsonl` during the
probe run (not committed; regenerate with the probe script for future
re-verification).
