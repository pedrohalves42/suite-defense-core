# ADR-025: Governance Closure - Zero Trust Closed Loop

**Status:** Approved  
**Date:** 2026-01-08  
**Supersedes:** ADR-024 (extends)

## Context

Following ADR-024 (Task Engine), we identified 4 critical governance gaps that prevent true "closed-loop" security operations:

1. **Gap 1: Kill Switch Global Multi-Nível** - No mechanism to halt all automated actions during incidents
2. **Gap 2: Task Debt Explícito** - Risk acceptance needs explicit tracking with expiry dates
3. **Gap 3: Proof of Coverage** - No validation that all critical detections have corresponding tasks
4. **Gap 4: Governance Reports** - No executive-level governance reporting

## Decision

Implement comprehensive governance controls to close all gaps and achieve SOC2-ready operational posture.

## Implementation

### Gap 1: Global Kill Switch

#### Database
```sql
-- System-wide operational mode
CREATE TABLE public.system_global_state (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  mode text CHECK (mode IN ('normal', 'restricted', 'emergency_stop')),
  activated_at timestamptz DEFAULT now(),
  expires_at timestamptz,
  activated_by uuid REFERENCES auth.users(id),
  reason text,
  impact_description text
);
```

#### Frontend Components
- `GlobalKillSwitchBanner.tsx` - Persistent banner when mode != 'normal'
- `KillSwitchControl.tsx` - Admin control panel to activate/deactivate
- `useSystemMode.ts` - Hook for reading and managing system mode

#### Behavior
| Mode | Effect |
|------|--------|
| `normal` | All systems operational |
| `restricted` | AI actions require approval, new automations blocked |
| `emergency_stop` | All automated actions halted, manual-only operation |

### Gap 2: Task Debt Explícito (Risk Acceptance)

#### Database
```sql
-- Risk debt tracking view
CREATE VIEW public.v_risk_debt_active AS
SELECT 
  t.id,
  t.tenant_id,
  t.title,
  t.severity,
  t.closed_at AS accepted_at,
  (t.closure_evidence->>'expiry_date')::timestamptz AS expires_at,
  t.closure_reason AS justification,
  t.closed_by AS accepted_by
FROM public.tasks t
WHERE t.status = 'accepted_risk'
  AND (t.closure_evidence->>'expiry_date')::timestamptz > now();

-- Summary view for dashboards
CREATE VIEW public.v_risk_debt_summary AS
SELECT 
  tenant_id,
  COUNT(*) AS total_active,
  COUNT(*) FILTER (WHERE severity = 'critical') AS critical_count,
  COUNT(*) FILTER (WHERE severity = 'high') AS high_count,
  COUNT(*) FILTER (WHERE expires_at < now() + interval '7 days') AS expiring_soon
FROM public.v_risk_debt_active
GROUP BY tenant_id;
```

#### Frontend Components
- `AcceptRiskDialog.tsx` - Modal for accepting risk with justification + expiry
- `RiskDebtCard.tsx` - Dashboard widget showing active risk debt
- `useRiskDebt.ts` - Hook for fetching risk debt data

### Gap 3: Proof of Coverage

#### Database
```sql
-- Coverage validation function
CREATE FUNCTION public.validate_governance_coverage(tenant_uuid uuid DEFAULT NULL)
RETURNS jsonb AS $$
DECLARE
  result jsonb;
  uncovered_alerts int;
  uncovered_insights int;
  orphan_tasks int;
BEGIN
  -- Count critical/high alerts without tasks
  SELECT COUNT(*) INTO uncovered_alerts
  FROM public.system_alerts a
  WHERE a.severity IN ('critical', 'high')
    AND a.resolved_at IS NULL
    AND (tenant_uuid IS NULL OR a.tenant_id = tenant_uuid)
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t 
      WHERE t.source_type = 'system_alert' 
        AND t.source_id = a.id::text
    );
  
  -- Count critical insights without tasks
  SELECT COUNT(*) INTO uncovered_insights
  FROM public.ai_insights i
  WHERE i.severity IN ('critical', 'high')
    AND i.dismissed_at IS NULL
    AND (tenant_uuid IS NULL OR i.tenant_id = tenant_uuid)
    AND NOT EXISTS (
      SELECT 1 FROM public.tasks t 
      WHERE t.source_type = 'ai_insight' 
        AND t.source_id = i.id::text
    );
  
  result := jsonb_build_object(
    'uncovered_alerts', uncovered_alerts,
    'uncovered_insights', uncovered_insights,
    'total_uncovered', uncovered_alerts + uncovered_insights,
    'is_compliant', (uncovered_alerts + uncovered_insights) = 0
  );
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

-- Auto-create task trigger for critical alerts
CREATE FUNCTION public.auto_create_task_for_critical_alert()
RETURNS trigger AS $$
BEGIN
  IF NEW.severity IN ('critical', 'high') THEN
    INSERT INTO public.tasks (
      tenant_id, source_type, source_id, title, description,
      severity, requires_human_review, auto_generated
    ) VALUES (
      NEW.tenant_id, 'system_alert', NEW.id::text,
      'Alerta: ' || NEW.title,
      NEW.message,
      NEW.severity::public.task_severity,
      true, true
    ) ON CONFLICT DO NOTHING;
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Frontend Components
- `CoverageGates.tsx` - Visual coverage validation widget
- `useCoverageGates.ts` - Hook for calling validation RPC

### Gap 4: Governance Reports

#### Database
```sql
-- Executive governance reports
CREATE TABLE public.governance_reports (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id uuid REFERENCES tenants(id) NOT NULL,
  report_type text CHECK (report_type IN ('weekly', 'monthly', 'quarterly')),
  period_start date NOT NULL,
  period_end date NOT NULL,
  executive_summary text,
  key_metrics jsonb DEFAULT '{}',
  risk_debt_summary jsonb,
  sla_performance jsonb,
  human_decisions jsonb,
  generated_by text DEFAULT 'system',
  generated_at timestamptz DEFAULT now(),
  created_at timestamptz DEFAULT now(),
  approved_by uuid REFERENCES auth.users(id),
  approved_at timestamptz
);

-- Weekly metrics collection function
CREATE FUNCTION public.collect_weekly_governance_metrics(
  tenant_uuid uuid,
  week_start date DEFAULT NULL
) RETURNS jsonb AS $$
DECLARE
  start_date date;
  end_date date;
  result jsonb;
BEGIN
  start_date := COALESCE(week_start, date_trunc('week', CURRENT_DATE)::date);
  end_date := start_date + interval '6 days';
  
  SELECT jsonb_build_object(
    'period_start', start_date,
    'period_end', end_date,
    'tasks_opened', COUNT(*) FILTER (WHERE created_at >= start_date AND created_at < end_date + interval '1 day'),
    'tasks_resolved', COUNT(*) FILTER (WHERE closed_at >= start_date AND closed_at < end_date + interval '1 day' AND status = 'resolved'),
    'tasks_ignored', COUNT(*) FILTER (WHERE closed_at >= start_date AND closed_at < end_date + interval '1 day' AND status = 'ignored'),
    'tasks_risk_accepted', COUNT(*) FILTER (WHERE closed_at >= start_date AND closed_at < end_date + interval '1 day' AND status = 'accepted_risk'),
    'sla_breached', COUNT(*) FILTER (WHERE sla_breached_at >= start_date AND sla_breached_at < end_date + interval '1 day'),
    'human_decisions', COUNT(*) FILTER (WHERE closed_at >= start_date AND closed_at < end_date + interval '1 day' AND requires_human_review = true),
    'avg_resolution_hours', EXTRACT(EPOCH FROM AVG(closed_at - created_at) FILTER (WHERE closed_at IS NOT NULL))/3600,
    'critical_open', COUNT(*) FILTER (WHERE severity = 'critical' AND status IN ('open', 'in_progress')),
    'net_tasks', COUNT(*) FILTER (WHERE closed_at >= start_date) - COUNT(*) FILTER (WHERE created_at >= start_date)
  ) INTO result
  FROM public.tasks
  WHERE tenant_id = tenant_uuid;
  
  RETURN result;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

#### Frontend Components
- `GovernanceReports.tsx` - Page for viewing/generating reports
- `useGovernanceReports.ts` - Hooks for CRUD operations

## Multi-Tenant Data Isolation Fix

During implementation, we identified and fixed a critical multi-tenant data leakage bug:

**Problem:** Users with access to multiple tenants were seeing merged data because frontend queries didn't filter by selected tenant.

**Solution:** Added tenant_id filtering to all agent-related queries:
- `useAgentSyncStatus.tsx` - Added `.eq('tenant_id', tenant.id)` 
- `AgentVersionSync.tsx` - Added `.eq('tenant_id', tenant.id)`

**Pattern for all tenant-scoped queries:**
```typescript
import { useTenant } from '@/hooks/useTenant';

const { tenant } = useTenant();

const { data } = useQuery({
  queryKey: ['some-data', tenant?.id],  // Include tenant in key
  queryFn: async () => {
    if (!tenant?.id) return [];  // Guard clause
    
    return supabase
      .from('table')
      .select('*')
      .eq('tenant_id', tenant.id)  // Filter by tenant
      // ...
  },
  enabled: !!tenant?.id,  // Only run when tenant is available
});
```

## Consequences

### Positive
- **Closed-loop governance**: Every detection creates a trackable work item
- **Emergency controls**: Kill switch provides immediate incident response capability
- **Risk transparency**: All accepted risks are explicitly tracked with expiry
- **Executive visibility**: Automated governance reports for compliance/auditing
- **Multi-tenant security**: Fixed data isolation bug preventing cross-tenant data leakage
- **SOC2 readiness**: Full audit trail of all security decisions

### Negative
- Additional database overhead for trigger-based task creation
- UI friction for accepting risk (intentional for compliance)
- Report generation may require optimization for large tenants

## Files Created/Modified

### Database Migrations
- `20260107234307_*.sql` - Gap 1 & 2 (Kill Switch + Risk Debt)
- `20260107234422_*.sql` - Gap 3 & 4 (Coverage + Reports)

### Frontend Hooks
- `src/hooks/useSystemMode.ts`
- `src/hooks/useRiskDebt.ts`
- `src/hooks/useCoverageGates.ts`
- `src/hooks/useGovernanceReports.ts`

### Frontend Components
- `src/components/layout/GlobalKillSwitchBanner.tsx`
- `src/components/tasks/AcceptRiskDialog.tsx`
- `src/components/governance/CoverageGates.tsx`
- `src/components/governance/RiskDebtCard.tsx`
- `src/components/governance/KillSwitchControl.tsx`

### Pages
- `src/pages/admin/GovernanceReports.tsx`

### Bug Fixes
- `src/hooks/useAgentSyncStatus.tsx` - Added tenant filter
- `src/components/admin/AgentVersionSync.tsx` - Added tenant filter

## References

- ADR-024: Task Engine
- SOC2 Trust Service Criteria
- NIST Cybersecurity Framework
