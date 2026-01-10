# Job Engine Governance

## Overview

This document defines the operational governance rules for the CyberShield Job Engine. These rules ensure consistent, auditable, and predictable behavior across all job processing operations.

## Core Principles

1. **No Silent Failures** - Every failure must be logged, tracked, and actionable
2. **Immutable Audit Trail** - All state transitions are recorded with evidence
3. **Hard Invariants** - Certain rules cannot be violated under any circumstances
4. **Automated Enforcement** - Governance is enforced by code, not process

## Health Invariants

### Absolute Invariants (Never Violated)

| Invariant | Description | Enforcement |
|-----------|-------------|-------------|
| Terminal states have `completed_at` | Jobs in `completed`, `failed`, or `cancelled` must have `completed_at` set | Trigger: `tr_ensure_completed_at` |
| Failed jobs exist in DLQ | Every `status = 'failed'` job has a corresponding `failed_jobs_dlq` entry | Trigger: `tr_create_dlq_on_failure` |
| No `pending` status | Legacy status not allowed in new jobs | CI Lint + Trigger validation |
| No orphan approvals | `approved = true` only valid for `approved` status | View: `v_job_health_anomalies` |

### Monitored Invariants (Alert on Violation)

| Metric | Threshold | Action |
|--------|-----------|--------|
| Zombie jobs (delivered > 2h) | > 0 | Auto-fail + Task P0 |
| DLQ divergence | ≠ 0 | Block deploy |
| Burn rate (1h) | ≥ 10 | PagerDuty |
| Cleanup finding jobs | > 0 for 3 runs | Incident |

## Cleanup Operations

### Philosophy

> **Cleanup is a safety net, not normal operation.**

If the cleanup function is consistently finding jobs to clean, something is wrong upstream.

### Cleanup Budget

| Jobs Cleaned / Hour | Status | Response |
|--------------------|--------|----------|
| 0 | ✅ OK | None |
| 1-10 | ⚠️ ALERT | Investigate within 24h |
| 11-50 | 🔶 WARNING | Create analysis task |
| > 50 | 🔴 INCIDENT | Immediate escalation |
| 3 consecutive > 0 | 🔴 INCIDENT | Root cause analysis |

### Cleanup Logging

All cleanup operations are logged to `system_events`:

```sql
INSERT INTO system_events (event_type, metadata)
VALUES ('job_cleanup_executed', jsonb_build_object(
  'cleaned_jobs', <count>,
  'executed_at', now()
));
```

## State Machine Rules

### Valid Status Transitions

```
queued → approved → delivered → completed
                              → failed
queued → cancelled (before approval)
approved → cancelled (before delivery)
```

### Invalid Transitions (Blocked)

- `completed` → any state (terminal)
- `failed` → any state (terminal)
- `cancelled` → any state (terminal)
- `delivered` → `queued` (no rollback)
- Any status → `pending` (deprecated)

## Escalation Procedures

### Level 1: Alert (Automated)
- Dashboard shows warning
- Logged to `system_events`
- No human action required

### Level 2: Task (Semi-Automated)
- Task created in task system
- Assigned based on rotation
- SLA: 24 hours

### Level 3: Incident (Human Required)
- PagerDuty notification
- Slack channel alert
- SLA: 4 hours

### Level 4: Deploy Block (Automated)
- CI/CD pipeline fails
- Merge blocked
- Requires explicit fix

## Audit Requirements

### Evidence Retention

| Data Type | Retention Period | Storage |
|-----------|-----------------|---------|
| Job records | 90 days | `jobs` table |
| DLQ entries | 1 year | `failed_jobs_dlq` |
| Cleanup logs | 90 days | `system_events` |
| State transitions | 1 year | `agent_evidence_logs` |

### Audit Queries

Weekly audit queries should be run to verify:

```sql
-- No orphan failed jobs
SELECT COUNT(*) as orphan_failed
FROM jobs j
LEFT JOIN failed_jobs_dlq d ON j.id = d.job_id
WHERE j.status = 'failed' AND d.id IS NULL;

-- No incomplete terminal jobs
SELECT COUNT(*) as incomplete_terminal
FROM jobs
WHERE status IN ('completed', 'failed', 'cancelled')
  AND completed_at IS NULL;

-- Cleanup activity trend
SELECT 
  date_trunc('day', (metadata->>'executed_at')::timestamp) as day,
  SUM((metadata->>'cleaned_jobs')::int) as total_cleaned
FROM system_events
WHERE event_type = 'job_cleanup_executed'
  AND created_at > now() - interval '30 days'
GROUP BY 1
ORDER BY 1;
```

## Change Management

### Breaking Changes

The following require ADR update and explicit approval:

1. Modifications to `v_job_health_anomalies`
2. Changes to status enum values
3. Removal of enforcement triggers
4. Alteration of DLQ schema

### Review Requirements

| Change Type | Reviewer | Documentation |
|-------------|----------|---------------|
| Trigger modification | On-call + Tech Lead | ADR required |
| View modification | On-call | ADR required |
| New status value | Tech Lead + Security | ADR required |
| Threshold adjustment | On-call | Changelog entry |

## Monitoring Dashboard

### Required Metrics Display

1. **Job Health Status**
   - Anomaly count (must be 0)
   - DLQ divergence (must be 0)
   - Zombie count (must be 0)

2. **SLO Status**
   - Current burn rate
   - Error rate
   - Delivery latency p95

3. **Cleanup Activity**
   - Last cleanup run
   - Jobs cleaned (last 24h)
   - Trend indicator

4. **State Distribution**
   - Jobs by status (pie chart)
   - Hourly trend (line chart)

## References

- [ADR-037: Job Engine Correction](./adr/ADR-037-job-engine-correction.md)
- [ADR-038: Job Engine SLO](./adr/ADR-038-job-engine-slo.md)
- [Google SRE Book](https://sre.google/sre-book/)
