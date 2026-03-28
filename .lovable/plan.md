

# Plan: Fix All TypeScript Build Errors

These errors stem from the aggressive `as any` → `as unknown` migration that left many casts incomplete. The fix is straightforward: replace `as unknown` with proper type assertions or add missing type annotations.

## Error Categories & Fixes

### 1. Test files: `as unknown` needs to be `as any` or properly typed (12 files)

Test mocks inherently create partial objects. Using `as unknown` breaks type assignment. The pragmatic fix is to restore `as any` in test mocks (tests are not production code) or use proper partial types.

**Files:**
- `src/hooks/useAuth.test.tsx` — 6 instances of `} as unknown` → `} as any` (lines 62, 78, 102, 121, 152, 196, 203)
- `src/hooks/__tests__/useAuth.test.tsx` — line 72: `} as unknown` → `} as AuthError`, line 100: `session as unknown` → `session as Session`  
- `src/hooks/useSuperAdmin.test.tsx` — 7 instances: `mockUser as unknown` → `mockUser as any` (lines 58, 83, 105, 139, 160, 185, 203)
- `src/hooks/useSubscription.test.tsx` — 2 instances: `} as unknown` → `} as any` (lines 51, 76)
- `src/domain/__tests__/Job.test.ts` — line 40: `'invalid' as unknown` → `'invalid' as JobType`
- `src/domain/__tests__/light-mode-config.test.ts` — line 154: `(config as unknown).props` → `(config as any).props`

### 2. Component error handling: `error.message` on `unknown` (5 files)

**Fix pattern:** Add `(error as Error).message` or use `error instanceof Error` guard.

- `src/components/admin/AgentSyncStatusCard.tsx` line 31: `error.message` → `(error as Error).message`
- `src/components/admin/AgentVersionSync.tsx` line 197: `error.message` → `(error as Error).message`
- `src/components/admin/ComplianceReportGenerator.tsx` line 98: already has `(error as Error)` — OK
- `src/components/admin/DynamicValidationSystem.tsx` lines 172, 254: `(error as Error).message` — already correct per code, but TS sees `unknown` from catch. Ensure `(error as Error).message`.

### 3. AgentQuickActions.tsx — `description` type issue (lines 98, 131)

The `onError` callback parameter is typed `(error: Error)` but `useMutation` infers error as `Error` by default. The issue is likely that `error?.message` returns `string | undefined` which is valid for ReactNode. Need to check if the actual error type annotation conflicts. Fix: ensure `onError: (error: Error) => {` is consistent, or cast `error.message as string`.

### 4. Supabase RPC calls with `as never` workaround (3 files)

- `src/hooks/useBlastRadius.tsx` line 64: `.rpc('check_blast_radius' as never, {...})` — the `as never` on the function name makes params type `never`. Fix: remove `as never` or use `as any` on the params object.
- `src/hooks/useForensicSnapshots.tsx` line 74: same pattern with `'create_forensic_snapshot' as never`
- `src/components/admin/DailySummaryCard.tsx` line 67: `.from('autonomy_actions' as never)` — table not in generated types. Fix: use `as any` for the entire query or keep `as never` and cast data.

### 5. Repository files: `Record<string, unknown>` not assignable to typed insert (4 files)

- `SupabaseCertificateRepository.ts` line 18: `rows as Array<Record<string, unknown>>` → `rows as never`
- `SupabaseFileIntegrityRepository.ts` line 18: same fix
- `SupabaseNetworkMetricsRepository.ts` line 17: same fix  
- `SupabaseJobRepository.ts` lines 66, 77: `persistence as Record<string, unknown>` → `persistence as never`

### 6. AutoApprovalPanel.tsx — TS2589 deep instantiation (line 86)

Already has `as any` workaround comment. The error is at line 86 with the `supabase.from('ai_action_configs').update(...)` chain. Keep the existing `as any` cast — this is a known Supabase SDK limitation.

### 7. ComplianceReportGenerator.tsx — multiple type issues (lines 697, 776, 851, 856, 922, 930)

- Lines with `(reportPayload as unknown as Record<string, unknown>)` — change to `(reportPayload as any)` since `ComplianceReportPayload` doesn't have index signature
- Lines 922, 930: operator `>` on `unknown` — need to cast the compared values to `number`

### 8. GeneratedReportsList.tsx — lines 207, 406

- Line 207: `.replace` on `unknown` — cast to `string`
- Line 406: `report as unknown as Record<string, unknown>` → `(report as any)`

### 9. DynamicValidationSystem.tsx — AgentStatus mapping (line 110)

The `map` callback returns objects missing `id`, `agent_name`, etc. But looking at the code (lines 100-109), the return object includes all required fields. The error claims otherwise — this might be a stale error or the `setAgents` call at line 113 is receiving the wrong type. The `agentsWithStatus` is typed as `AgentStatus[]` already. This should be fine. May need to verify this is a real error.

### 10. HealthTrendChart.tsx — getAgentStatusInfo param type (line 48)

The mapped object `{ id, status, last_heartbeat, enrolled_at }` has all `unknown` values from `Record<string, unknown>`. Fix: the map already does `String(...)` casts, but the object literal still has `unknown` properties. Cast properly: `getAgentStatusInfo({ status: String(a.status), last_heartbeat: String(a.last_heartbeat) })`.

### 11. useApprovalRequests.ts — `Json` type (line 210)

`Cannot find name 'Json'` — need to import `Json` from `@/integrations/supabase/types`.

### 12. ProcessJobResult.ts — string not assignable to Record (line 65)

`job.complete({ stdout: String(...) })` — `complete()` expects `Record<string, unknown>` and `{ stdout: string }` satisfies that. Actually, `{ stdout: string }` IS assignable to `Record<string, unknown>`. This may be a different issue — the method signature might use a stricter type. The actual error says `Argument of type 'string' is not assignable to parameter of type 'Record<string, unknown>'`. So perhaps the call is `job.complete(someString)` not `job.complete({...})`. Let me re-read: line 65 is `job.complete({ stdout: String(command.stdout || "") })`. This should work. Unless `complete` takes a single arg that's `Record<string, unknown>` and the `{ stdout: string }` doesn't have an index signature. Fix: `job.complete({ stdout: String(command.stdout || "") } as Record<string, unknown>)`.

## Implementation Approach

Fix files in batches, prioritizing:
1. **Test files** (restore `as any` for mocks — ~6 files)
2. **Component error handling** (`error.message` casts — ~5 files)  
3. **Repository `as never` casts** (~4 files)
4. **RPC/Supabase workarounds** (~3 files)
5. **ComplianceReportGenerator complex casts** (1 file, ~10 fixes)
6. **Remaining individual fixes** (~5 files)

Total: ~25 files, ~50 individual fixes.

## Technical Details

- In test files, `as any` is acceptable since test mocks are intentionally partial objects
- For Supabase SDK type issues (deep instantiation, unknown table names), `as never` or `as any` are standard workarounds
- For catch blocks, `(error as Error).message` is the standard pattern
- Import `Json` type from generated types where needed

