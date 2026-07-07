# R5 — Reliability Score (specification, NOT computed)

Date: 2026-07-07
Status: **specification only — computation blocked under RC-1**

This document defines the shape of the Reliability Score so that when
adoption grows past the RC-1 freeze, computing R5 becomes a mechanical
execution of an already-agreed spec. **No score is produced from this
document.** No dashboard, no publication, no aggregation.

## Inputs

R5 consumes the R4.5 inventory artifact only:

- `docs/audits/active/r4-5-adoption-inventory.generated.json`
- `docs/audits/active/r4-5-adoption-inventory.generated.md`

R5 does not read source code, does not call runtime, and does not query
the database. It is a pure function of the inventory.

## Axes (frozen)

| Axis | Meaning | Source field |
| --- | --- | --- |
| Timeout | Per-attempt bound enforced | `timeout` flag per function |
| Retry | Transient-error recovery enabled | `retry` flag per function |
| Breaker | Failure isolation enabled | `breaker` flag per function |
| Idempotency | Duplicate-safe writes | `idempotency` flag per function |
| Observability | Structured logging + telemetry events | derived (see below) |
| Coverage | Fraction of eligible functions adopting each axis | derived |

Observability is derived from the presence of the R4 telemetry event
names (`reliability.*`) in the pipeline; under RC-1 this is a constant
(wrappers already emit them), so the axis is "ready" but not scored.

## Weights (frozen, sum = 1.00)

```
Timeout        0.20
Retry          0.20
Breaker        0.15
Idempotency    0.15
Observability  0.15
Coverage       0.15
```

Rationale: Timeout and Retry are the two axes with production evidence
under RC-1, so they carry the highest weight. Breaker and Idempotency
carry meaningful but lower weight because they are spec-frozen and not
yet adopted. Observability and Coverage act as multiplicative-style
"quality gates" but are kept as additive axes to preserve linearity.

## Score formula (frozen)

For each axis `a`:

```
adoption(a) = adopted_functions(a) / eligible_functions(a)
```

Global score:

```
R5 = sum_over_axes( weight(a) * adoption(a) ) * 100
```

`R5 ∈ [0, 100]`. Rounded to one decimal place for reporting only; the
raw value is preserved in the JSON output.

## Thresholds (frozen)

| Band | Range | Meaning |
| --- | --- | --- |
| Red | 0 – 39 | Reliability primitives largely unadopted |
| Amber | 40 – 69 | Partial adoption; hotspots remain |
| Green | 70 – 89 | Broad adoption, some gaps |
| Platinum | 90 – 100 | Full adoption across eligible surface |

Bands are **descriptive**, not gates. No CI job fails on band today.

## Eligibility rules (frozen)

- A function is **eligible for Timeout** iff it performs any outbound
  network I/O.
- A function is **eligible for Retry** iff it performs an outbound GET
  (or a documented idempotent call) with no side effects on failure.
- A function is **eligible for Breaker** iff it depends on a single
  external provider whose failure can cascade.
- A function is **eligible for Idempotency** iff it accepts writes from
  clients that may retry (webhooks, agent callbacks).
- Functions that do only Supabase client reads are eligible only for
  Timeout and Observability.

Eligibility itself is derived from the R4.5 scanner. Under RC-1, the
concrete eligibility mapping is deferred to the moment R5 is first
computed — the point being that the algorithm is fixed, not the numbers.

## Report format (frozen)

R5 produces two artifacts, both under `docs/audits/active/`:

- `r5-reliability-score.generated.json` — full breakdown per axis and
  per function.
- `r5-reliability-score.generated.md` — human-readable summary with
  the global score, per-axis adoption, and top under-adopted functions.

## Blocking conditions (do not compute R5 while any hold)

1. RC-1 is active.
2. Fewer than N functions adopt at least one non-Timeout primitive.
   N is intentionally left unspecified in RC-1; it will be set when
   the observation window on Wave 3A.1 closes.
3. Wave 3A.2 has not shipped or been explicitly declined.

Until these clear, any published score would describe rollout strategy
rather than platform maturity, so R5 remains spec-only.
