# D18-1 — LATENT-DEPLOY-POLICY-01 Result

**Status:** RESOLVED
**Scope:** `supabase/functions/get-agent-policy/index.ts`
**Date:** 2026-06-28

## Context

`get-agent-policy` historically queried `tenant_settings` for columns that
never existed in the schema (`dns_enabled`, `heartbeat_interval`,
`dns_upstream`, `blocked_categories`, and a `setting_key/setting_value`
shape). Every tenant therefore silently fell back to hard-coded defaults,
making per-tenant policy configuration effectively dead code.

## Verified contract (vs. live schema)

| Policy field             | Source column                                  | Notes |
|--------------------------|------------------------------------------------|-------|
| `dns_enabled`            | `tenant_settings.dns_local_filter_enabled`     | Real column. Default `true`. |
| `dns_service_running`    | mirrors `dns_enabled`                          | Operational mirror. |
| `agent_min_version`      | `tenant_version_policies.min_version` → `agent_releases.version` (latest active windows) → `v4.0.0` | Tenant pin > rollout default > floor. |
| `blocked_domains_count`  | `count(blocked_websites WHERE is_active)`      | Real column. |
| `heartbeat_interval_max` | (no column) static `120`                       | Documented gap; not tenant-configurable yet. |
| `dns_upstream`           | (no column) static `[8.8.8.8:53, 1.1.1.1:53]` | Documented gap. |
| `blocked_categories`     | (no column) static `[]`                        | Documented gap. |
| `custom_rules`           | (no column) static `[]`                        | Documented gap. |

Confirmed columns from `_shared/database.types.ts`:
`tenant_settings { dns_local_filter_enabled, force_human_review_critical,
business_hours, alert_*, enable_*, stripe_enabled, virustotal_enabled, … }`
— no DNS upstream, heartbeat, or category fields exist.

## Changes

1. Replaced the bogus projection with `select('dns_local_filter_enabled')`.
2. Wired `dns_enabled` / `dns_service_running` to the real column with the
   same default (`true`) — no behavioral change for tenants that hadn't set
   it, real behavior for tenants that have.
3. Added `tenant_version_policies.min_version` lookup so a tenant pin
   actually takes effect (previously ignored).
4. Documented the remaining static fields as known gaps rather than
   pretend-configurable.
5. Added structured log line summarising the policy decision.

## Compatibility

- Response shape unchanged.
- All previously-default values remain the defaults for tenants without
  rows in `tenant_settings` / `tenant_version_policies`.
- No migration required.

## Gates

- `deno check` clean (covered by Tier-1 gate).
- No `@ts-nocheck` reintroduced.

## Follow-ups (out of scope)

- If per-tenant `heartbeat_interval_max`, `dns_upstream`, or
  `blocked_categories` are wanted, they need a schema addition + migration
  — open as a separate feature, not as type debt.
