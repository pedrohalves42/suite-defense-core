# ADR-027: Edge Function Contract Testing Framework

## Status
Accepted

## Context

The system experienced a critical bug where an Edge Function (`action-center-feed`) referenced a non-existent column (`actor_type`) in the `audit_logs` table. This caused:

1. **Silent failures**: The Edge Function returned errors that were hard to diagnose
2. **Drift detection gap**: No automated way to detect schema changes affecting Edge Functions
3. **Regression risk**: Nothing prevented re-introduction of the problematic column

### Root Cause Analysis

The bug occurred because:
- Edge Functions are deployed independently from database schema
- No formal contract existed between Edge code and DB schema
- Schema changes were not validated against Edge Function dependencies

## Decision

Implement a **Contract Testing Framework** that:

1. **Defines explicit contracts** between Edge Functions and database schema
2. **Validates at CI time** that all contracts are satisfied
3. **Blocks deployment** if any contract is violated
4. **Documents dependencies** for each Edge Function

### Framework Structure

```
contracts/
├── schemas/           # Schema contracts (required/forbidden columns)
├── edge/              # Per-function contract tests
├── invariants/        # Global security invariants
└── utils/             # Shared testing utilities
```

### Contract Types

#### Schema Contracts
Define what columns must exist and what columns are forbidden:

```typescript
export const auditLogsContract: SchemaContract = {
  table: 'audit_logs',
  requiredColumns: ['id', 'event_type', 'actor_id', 'details', 'created_at'],
  forbiddenColumns: ['actor_type']  // ROOT CAUSE of previous bug
};
```

#### Edge Function Contracts
Validate that functions can access their dependencies:

```typescript
test('audit_logs schema matches contract', async () => {
  await assertTableContract(supabase, auditLogsContract);
});
```

#### Security Invariants
Global rules that must always hold:

```typescript
test('no SECURITY DEFINER without search_path', async () => {
  const { data } = await supabase.rpc('find_unsafe_definer_functions');
  expect(data).toEqual([]);
});
```

### CI Integration

Contracts are validated on every PR:

```yaml
- name: Contract Tests
  run: |
    cd contracts
    npm ci
    npx playwright test
```

If any test fails, the PR is blocked.

## Consequences

### Positive
- **Prevents drift bugs**: Schema changes are validated against Edge dependencies
- **Documents contracts**: Clear visibility into what each Edge Function needs
- **Blocks regressions**: Forbidden columns cannot be reintroduced
- **Early detection**: Issues caught at CI, not production

### Negative
- **Maintenance overhead**: Contracts must be updated when schemas change
- **Test time**: Adds ~30s to CI pipeline

### Neutral
- Requires developers to think about Edge ↔ DB contracts explicitly
- Forces documentation of dependencies

## Implementation

### Phase 1: Core Framework ✅
- Contract utility functions
- Schema contracts for critical tables
- Basic invariant tests

### Phase 2: Edge Coverage
- Contract tests for all Edge Functions
- Emergency mode compliance tests

### Phase 3: CI Gates
- Block deployment on contract failure
- Generate evidence artifacts

## Validation

Run the RPC to verify no unsafe functions:

```sql
SELECT * FROM find_unsafe_definer_functions();
-- Should return empty
```

Run contract tests:

```bash
cd contracts && npx playwright test
```

## Related

- ADR-023: RLS Hardening
- ADR-026: Security Operations
- SECURITY_INVARIANTS.md
