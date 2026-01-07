# ADR-024: Task Engine - Closed-Loop Governance System

## Status
Accepted

## Date
2026-01-07

## Context

The CyberShield platform was detecting and analyzing security issues effectively through AI insights and system alerts. However, there was a critical gap in the operational workflow:

1. **No actionable work items**: Insights and alerts were visible but could be silently ignored
2. **No SLA tracking**: No enforcement of response times for critical issues
3. **Missing audit trail**: No record of who worked on what and when
4. **Alert fatigue**: Users overwhelmed by notifications without clear work prioritization
5. **404 on /tasks**: The UI expected a tasks concept that didn't exist in the database

## Decision

Implement a **Task Engine** that transforms detections into auditable work items with mandatory closure.

### Core Components

#### 1. Tasks Table
```sql
CREATE TABLE public.tasks (
  id uuid PRIMARY KEY,
  tenant_id uuid NOT NULL,
  source_type text NOT NULL, -- ai_insight, system_alert, playbook_execution, red_team, manual
  source_id uuid,
  title text NOT NULL,
  description text,
  severity text NOT NULL, -- critical, high, medium, low, info
  status text NOT NULL DEFAULT 'open', -- open, in_progress, blocked, resolved, ignored
  assigned_to uuid,
  due_at timestamptz,
  sla_breached_at timestamptz,
  closed_at timestamptz,
  closed_by uuid,
  closure_reason text,
  closure_evidence jsonb,
  requires_human_review boolean,
  auto_generated boolean,
  playbook_id uuid,
  created_at timestamptz,
  updated_at timestamptz
);
```

#### 2. Automatic Task Creation
Database triggers automatically create tasks when:
- Critical/High severity AI insights are detected
- Critical/High severity system alerts are raised

SLA is automatically assigned based on severity:
- Critical: 4 hours
- High: 24 hours

#### 3. Bidirectional Sync
When source objects (insights, alerts) are resolved, tasks are automatically updated.
When insights are acknowledged, tasks move to "in_progress".

#### 4. SLA Monitoring
Function `check_task_sla_breach()` marks tasks that exceeded their due date.

#### 5. Statistics View
`v_task_stats` provides per-tenant aggregated metrics:
- Open/in-progress/blocked/resolved/ignored counts
- Critical and high priority open counts
- SLA breach count
- Average resolution time

### RLS Policies
- Users can read/update tasks within their tenant
- Only service_role can insert tasks (automation only)
- No direct frontend task creation

### Frontend Implementation
- `/admin/tasks` page with filtering and quick actions
- Task detail drawer for full workflow
- Dashboard summary card with urgent work indicators
- Badge in navigation showing open task count

## Consequences

### Positive
- **Closed-loop governance**: Every detection becomes trackable work
- **SLA enforcement**: Response times are monitored and breaches flagged
- **Audit trail**: Complete record of task lifecycle with timestamps
- **SOC2 compliance**: Evidence of issue handling and resolution
- **Reduced alert fatigue**: Prioritized work queue instead of notification flood
- **Operational visibility**: Clear metrics on workload and performance

### Negative
- Additional database triggers (minor performance impact)
- Users must close tasks explicitly (intentional friction)
- More complex UI with new page and components

### Neutral
- Tasks are never deleted, only status-changed (by design for audit)
- Duplicate prevention via UNIQUE(source_type, source_id)

## Implementation Details

### Database Objects Created
- Table: `tasks`
- View: `v_task_stats` (with security_invoker)
- Functions: 
  - `create_task_from_critical_insight()`
  - `create_task_from_system_alert()`
  - `sync_task_on_source_resolution()`
  - `check_task_sla_breach()`
- Triggers:
  - `tr_create_task_from_insight` (ai_insights)
  - `tr_create_task_from_alert` (system_alerts)
  - `tr_sync_task_insight` (ai_insights)
  - `tr_sync_task_alert` (system_alerts)
  - `tr_tasks_updated_at` (tasks)
- Realtime enabled for tasks table

### Frontend Files Created
- `src/hooks/useTasks.ts` - React Query hooks
- `src/pages/admin/Tasks.tsx` - Main tasks page
- `src/components/tasks/TaskDetailDrawer.tsx` - Detail view
- `src/components/dashboard/TasksSummaryCard.tsx` - Dashboard widget

### Files Modified
- `src/App.tsx` - Added /admin/tasks route
- `src/components/GlobalJobWatcher.tsx` - Fixed navigation path

## References
- [ADR-023: RLS Hardening](./ADR-023-rls-hardening.md)
- [Security Architecture](../SECURITY_ARCHITECTURE.md)
- [Logging & Monitoring Policy](../../policies/05_logging_monitoring_policy.md)
