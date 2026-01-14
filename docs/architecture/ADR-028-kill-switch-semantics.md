# ADR-028: Kill Switch Semantics

**Status**: Accepted  
**Date**: 2026-01-14  
**Author**: CSA-FH Team  
**References**: ADR-027-edge-contracts

---

## Context

Production systems need a reliable way to halt operations during emergencies. Without a centralized kill switch:

- Runaway processes can cause cascading failures
- Security breaches have no quick containment
- Operators lack control during incidents
- Recovery is slow and error-prone

---

## Decision

Implement a three-state kill switch with well-defined semantics for each component.

### System States

| State | Description | Trigger |
|-------|-------------|---------|
| `normal` | Full operation | Default, manual recovery |
| `restricted` | Limited operation | Manual, gradual recovery |
| `emergency_stop` | Full halt | Manual, automated triggers |

### State Storage

```sql
CREATE TABLE system_global_state (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  mode TEXT NOT NULL DEFAULT 'normal' 
    CHECK (mode IN ('normal', 'restricted', 'emergency_stop')),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  changed_by TEXT NOT NULL
);
```

### Component Behavior by State

#### Edge Functions

| State | Behavior | Response |
|-------|----------|----------|
| `normal` | Full processing | 200/400/500 as normal |
| `restricted` | Non-critical disabled | 503 for non-critical |
| `emergency_stop` | All mutations blocked | 503 with Retry-After |

#### Scheduled Jobs

| State | Behavior |
|-------|----------|
| `normal` | Execute normally |
| `restricted` | Only critical jobs run |
| `emergency_stop` | All jobs abort with exception |

#### Database Writes

| State | Behavior |
|-------|----------|
| `normal` | All writes allowed |
| `restricted` | Audit logs only |
| `emergency_stop` | Audit logs only |

#### UI

| State | Behavior |
|-------|----------|
| `normal` | Full interactivity |
| `restricted` | Warning banner, limited actions |
| `emergency_stop` | Read-only, emergency banner |

---

## Implementation

### RPC Functions

```sql
-- Check if in emergency mode
CREATE FUNCTION is_emergency_mode() 
RETURNS BOOLEAN AS $$
BEGIN
  RETURN EXISTS (
    SELECT 1 FROM system_global_state 
    WHERE mode = 'emergency_stop'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Get current mode safely
CREATE FUNCTION get_system_mode_safe() 
RETURNS TEXT AS $$
BEGIN
  RETURN COALESCE(
    (SELECT mode FROM system_global_state LIMIT 1),
    'normal'
  );
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;

-- Assert system allows jobs
CREATE FUNCTION assert_system_allows_jobs()
RETURNS VOID AS $$
DECLARE
  current_mode TEXT;
BEGIN
  SELECT mode INTO current_mode FROM system_global_state LIMIT 1;
  IF current_mode = 'emergency_stop' THEN
    RAISE EXCEPTION 'SYSTEM_EMERGENCY_STOP: Jobs are halted';
  END IF;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER SET search_path = public;
```

### Edge Function Integration

```typescript
// Health probe middleware
import { isEmergencyMode, emergencyModeResponse } from './_shared/health-probe.ts';

Deno.serve(async (req) => {
  const supabase = createClient(...);
  
  // Check emergency mode first
  if (await isEmergencyMode(supabase)) {
    return emergencyModeResponse(corsHeaders);
  }
  
  // Normal processing...
});
```

### Job Integration

```typescript
// At start of every scheduled job
const { error } = await supabase.rpc('assert_system_allows_jobs');
if (error) {
  console.error('Job aborted:', error.message);
  throw error;
}
```

---

## State Transitions

```
┌─────────────┐
│   normal    │◄──────────────────────────┐
└──────┬──────┘                           │
       │                                  │
       │ activate_restricted()            │ full_recovery()
       ▼                                  │
┌─────────────┐                           │
│ restricted  │◄──────────────────────────┤
└──────┬──────┘                           │
       │                                  │
       │ activate_emergency()             │ gradual_recovery()
       ▼                                  │
┌─────────────┐                           │
│emergency_stop│───────────────────────────┘
└─────────────┘
```

### Transition Rules

1. **Normal → Restricted**: Manual only
2. **Normal → Emergency**: Manual or automated trigger
3. **Restricted → Emergency**: Manual or automated trigger
4. **Emergency → Restricted**: Manual only (gradual recovery)
5. **Restricted → Normal**: Manual only (full recovery)
6. **Emergency → Normal**: NOT ALLOWED (must go through restricted)

---

## Automated Triggers

### Conditions for Auto-Emergency

1. **Failed login spike**: > 100 failures in 5 minutes
2. **Replay attack detection**: Any confirmed replay
3. **RLS test failure**: Critical table unprotected
4. **Cascade delete detected**: > 1000 rows in single operation

### Auto-Trigger Implementation

```sql
CREATE FUNCTION auto_emergency_trigger()
RETURNS TRIGGER AS $$
BEGIN
  -- Check if threshold exceeded
  IF NEW.failed_count > 100 AND 
     NEW.window_start > NOW() - INTERVAL '5 minutes' THEN
    
    UPDATE system_global_state 
    SET mode = 'emergency_stop',
        updated_at = NOW(),
        changed_by = 'auto_trigger: failed_login_spike';
        
    -- Log to audit
    INSERT INTO audit_logs (event_type, details)
    VALUES ('emergency_auto_activated', 
            jsonb_build_object('trigger', 'failed_login_spike'));
  END IF;
  
  RETURN NEW;
END;
$$ LANGUAGE plpgsql;
```

---

## Recovery SLOs

| Metric | Target |
|--------|--------|
| Time to activate emergency | < 30 seconds |
| Time to detect need for emergency | < 5 minutes |
| Time to identify root cause | < 30 minutes |
| Time to full recovery (MTTR) | < 2 hours |

---

## Monitoring

### Key Metrics

1. Current system mode
2. Time in emergency mode
3. Number of blocked requests during emergency
4. Recovery time from last incident

### Alerts

| Condition | Severity | Action |
|-----------|----------|--------|
| Mode changed | Info | Log |
| Emergency activated | Critical | Page on-call |
| Emergency > 1 hour | Critical | Escalate |
| Failed recovery | Critical | Page lead |

---

## Consequences

### Positive

- Clear semantics for all components
- Centralized control during incidents
- Automated protection against runaway failures
- Gradual recovery reduces risk

### Negative

- Additional complexity in all Edge Functions
- False positives can cause unnecessary outages
- Requires operator training

### Neutral

- Explicit trade-off between availability and safety
- Requires monitoring infrastructure

---

## Testing

### E2E Tests Required

1. `kill-switch-cascade.spec.ts` - Full cascade validation
2. State transition tests
3. Recovery procedure tests
4. Auto-trigger tests

### Contract Tests

- Emergency mode RPC accessibility
- Health probe integration
- Job abort behavior

---

## References

- [RUNBOOK-EMERGENCY-MODE.md](../runbooks/RUNBOOK-EMERGENCY-MODE.md)
- [ADR-027-edge-contracts.md](./ADR-027-edge-contracts.md)
- Netflix Circuit Breaker Pattern
- Google SRE: Emergency Response
