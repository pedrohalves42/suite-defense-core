# ADR-038: Job Engine Service Level Objectives

## Status
**Accepted** - 2026-01-10

## Context

Following the corrections documented in [ADR-037](./ADR-037-job-engine-correction.md), the Job Engine is now in a consistent state. However, we need formal SLOs to:

1. Define measurable service quality targets
2. Enable automated alerting and incident response
3. Prevent silent regressions
4. Provide defensible metrics for audits

This ADR establishes the formal SLO framework for the Job Engine.

## Decision

### Service Level Indicators (SLIs)

#### SLI #1: Job Delivery Latency
**Definition:** Time between `created_at` and `delivered_at`

| Percentile | Target |
|------------|--------|
| p50 | ≤ 5s |
| p95 | ≤ 30s |
| p99 | ≤ 60s |

**Measurement:**
```sql
SELECT 
  percentile_cont(0.95) WITHIN GROUP (
    ORDER BY EXTRACT(EPOCH FROM (delivered_at - created_at))
  ) as p95_delivery_seconds
FROM jobs
WHERE delivered_at IS NOT NULL
  AND created_at > now() - interval '1 hour';
```

#### SLI #2: Execution Completion Rate
**Definition:** Percentage of jobs that terminate in a valid terminal state

**Valid Terminal States:**
- `completed` - Successful execution
- `failed` - Execution failed (tracked in DLQ)
- `cancelled` - Explicitly cancelled (must have `completed_at` AND `error_message`)

**Target:** 99.9%

**Critical Invariant:**
> A job in `cancelled` status counts as a valid terminal state **if and only if**:
> - `completed_at IS NOT NULL`
> - `error_message IS NOT NULL` (for audit trail)
>
> This ensures cancelled jobs are distinguishable from abandoned jobs.

#### SLI #3: Failure Traceability
**Definition:** Percentage of `failed` jobs that have corresponding DLQ entries

**Target:** 100%

**Measurement:**
```sql
SELECT 
  CASE 
    WHEN (SELECT COUNT(*) FROM jobs WHERE status = 'failed') = 0 THEN 100
    ELSE (
      (SELECT COUNT(*) FROM failed_jobs_dlq)::float / 
      (SELECT COUNT(*) FROM jobs WHERE status = 'failed') * 100
    )
  END as dlq_coverage_percent;
```

#### SLI #4: State Validity
**Definition:** Number of jobs in invalid states

**Target:** 0 (absolute)

**Source:** `v_job_health_anomalies`

Invalid states include:
- Jobs with `status = 'queued'` AND `approved = true` (should be `approved`)
- Terminal jobs without `completed_at`
- `pending` status (legacy, no longer valid)
- DLQ entries without corresponding failed jobs

#### SLI #5: Zombie Detection
**Definition:** Jobs in `delivered` status for more than 2 hours

**Target:** 0

**Measurement:**
```sql
SELECT COUNT(*) as zombie_count
FROM jobs
WHERE status = 'delivered'
  AND delivered_at < now() - interval '2 hours';
```

### Service Level Objectives (SLOs)

| SLO | Target | Window | Alert Threshold |
|-----|--------|--------|-----------------|
| Delivery Latency (p95) | ≤ 30s | 1 hour | > 60s |
| Completion Rate | 99.9% | 24 hours | < 99% |
| DLQ Coverage | 100% | Always | < 100% |
| State Validity | 0 anomalies | Always | > 0 |
| Zombie Jobs | 0 | Always | > 0 |

### Burn Rate Thresholds

Based on Multi-Window, Multi-Burn-Rate Alerting:

| Window | Burn Rate | Severity | Action |
|--------|-----------|----------|--------|
| 1 hour | ≥ 10 | CRITICAL | PagerDuty + Block Deploy |
| 1 hour | ≥ 4 | HIGH | Alert + Escalate |
| 1 hour | ≥ 2 | WARNING | Alert |
| 1 hour | ≥ 1 | ALERT | Log + Dashboard |
| 6 hours | ≥ 0.5 | WARNING | Alert |

### Automatic Actions

| Violation | Automatic Action | Severity |
|-----------|------------------|----------|
| State validity anomaly | Create Task P0 | CRITICAL |
| DLQ divergence > 0 | Block deploy | HIGH |
| Zombie jobs > 0 | Auto-fail job + Create Task | HIGH |
| Burn rate ≥ 10 | PagerDuty alert | CRITICAL |
| Delivery latency p95 > 60s | Alert + Degrade | MEDIUM |
| Cleanup finding jobs | Log event | INFO |

### Error Budget

- **Monthly Error Budget:** 0.1% (43.2 minutes of degradation)
- **Budget Consumption Rate:** Tracked via burn rate
- **Budget Exhaustion Policy:** Feature freeze until restored

## Implementation

### CI/CD Health Gate

All invariants are validated before deploy via `scripts/job-engine-health-gate.sql`:
- Hard fail on any violation
- No bypass mechanism
- Runs on staging for PRs, production for main

### Cleanup Budget

The `cleanup_stuck_pending_jobs()` function is a safety net, not a normal operation.

| Cleaned Jobs / Execution | Status | Action |
|--------------------------|--------|--------|
| 0 | OK | None |
| 1-10 | ALERT | Investigate |
| > 10 | WARNING | Create analysis task |
| 3 consecutive > 0 | INCIDENT | Escalate |

### Breaking Change Policy

Changes to `v_job_health_anomalies` are considered **breaking changes** and require:
- Explicit ADR update
- Review from on-call engineer
- Validation that all UNION clauses still exist

## Consequences

### Positive
- Measurable, defensible service quality
- Automated incident detection
- Prevention of silent regressions
- Audit-ready documentation

### Negative
- Stricter deploy requirements
- Potential for false positives blocking deploys
- Requires ongoing maintenance of health checks

### Risks Mitigated
- CI database dependency: Gate runs against staging with 10min timeout
- False negatives: View changes are breaking changes
- Normalization of cleanup: Budget documented with escalation

## References

- [ADR-037: Job Engine Correction](./ADR-037-job-engine-correction.md)
- [Google SRE Book: Service Level Objectives](https://sre.google/sre-book/service-level-objectives/)
- [Multi-Window, Multi-Burn-Rate Alerts](https://sre.google/workbook/alerting-on-slos/)
