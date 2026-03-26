

# Plan: Implement 3 Priority Enterprise Gaps

## Overview
Implement SCIM Provisioning (A-1), Post-Mortem Template (M-5), and Backup Restore Test Evidence (C-2).

## Items to Implement

### 1. SCIM Provisioning Edge Function
- Create `supabase/functions/scim-provisioning/index.ts` with RFC 7644 endpoints (`/Users`, `/Groups`, `/ServiceProviderConfig`, `/Schemas`, `/ResourceTypes`)
- Uses existing `corsHeaders` pattern from `_shared/cors.ts`
- Auth via Bearer token matched against `scim_api_key` on `tenants` table
- CRUD operations for Users (create via `supabase.auth.admin.createUser`, deactivate via ban, role sync) and Groups
- Audit logging for all provisioning actions

### 2. Database Migration
Single migration creating:
- `scim_groups` table (tenant-scoped, with `external_id`, `display_name`)
- `group_members` join table (group + user + tenant, unique constraint)
- `scim_api_key` and `scim_config` columns on `tenants`
- RLS policies on both new tables
- `generate_scim_api_key()` function + trigger on `tenants`
- `backup_verifications` table for restore test tracking

**Note:** The proposed SQL tries to `ALTER TABLE auth.users` which is forbidden on reserved schemas. This will be removed from the migration.

### 3. Post-Mortem Template
- Create `docs/runbooks/POST-MORTEM-TEMPLATE.md` with blameless format (timeline, impact analysis, root cause, action items, lessons learned, sign-off)

### 4. Backup Restore Test Script
- Create `scripts/backup-restore-test.sh` — automated pg_dump/pg_restore test with evidence report generation
- Creates markdown evidence report with hashes and validation results

## Technical Considerations
- SCIM function uses `Deno.serve()` per project standard
- Will NOT modify `auth.users` schema (reserved)
- SCIM function authenticates via API key (no JWT), appropriate for IdP-to-service calls
- RLS policies reference existing `get_current_tenant()` and `get_current_role()` functions

## Files Changed
| File | Action |
|------|--------|
| `supabase/functions/scim-provisioning/index.ts` | Create |
| `docs/runbooks/POST-MORTEM-TEMPLATE.md` | Create |
| `scripts/backup-restore-test.sh` | Create |
| Migration (scim_groups, group_members, backup_verifications) | Create via migration tool |

