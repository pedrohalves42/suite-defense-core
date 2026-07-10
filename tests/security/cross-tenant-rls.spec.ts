/**
 * P0-01 — Cross-Tenant RLS Isolation Functional Test
 *
 * Iterates every table in MULTI_TENANT_TABLES and, for each of two
 * authenticated Supabase clients (Tenant A user, Tenant B user), asserts:
 *
 *   SELECT count(*) FROM <t> WHERE tenant_id = <other tenant> === 0
 *
 * Requires env (see e2e/.env.test.example):
 *   VITE_SUPABASE_URL
 *   VITE_SUPABASE_PUBLISHABLE_KEY
 *   TEST_TENANT_A_EMAIL / _PASSWORD / _ID
 *   TEST_TENANT_B_EMAIL / _PASSWORD / _ID
 *
 * Generates evidence artifacts under docs/audits/active/evidence/P0-01-rls/:
 *   - report.json  (full matrix)
 *   - after.sql    (queries executed, for reproducibility)
 *
 * Exit criteria:
 *   - 0 leaked rows across all tables and both scenarios → P0-01 = False Positive
 *   - Any leaked rows                                    → P0-01 = Confirmed
 */
import { describe, it, expect, beforeAll } from 'vitest';
import { mkdirSync, writeFileSync } from 'node:fs';
import { resolve } from 'node:path';
import {
  TENANT_CONFIG,
  createTenantAClient,
  createTenantBClient,
  validateTenantTestConfig,
} from '../../e2e/helpers/tenant-test-client';

const MULTI_TENANT_TABLES = [
  'agents','tasks','system_alerts','jobs','ai_insights',
  'agent_web_activity','agent_disk_metrics','agent_network_info','agent_builds',
  'agent_evidence_logs','agent_rollback_events','agent_safe_mode_events',
  'enrollment_keys','security_policies','governance_reports','playbook_executions',
  'scheduled_jobs','vuln_findings','software_inventory','user_roles',
  'tenant_features','tenant_action_policies','blocked_websites',
  'ai_action_logs','api_keys','api_request_logs','compliance_policies',
  'failed_login_attempts','quarantined_files','report_executions','reports',
  'security_logs','soc2_controls','soc2_criteria','tenant_settings',
  'tenant_subscriptions','vendor_risk_registry','virus_scans',
  'anomaly_events','audit_reason_trees','ai_action_validations',
  'antivirus_status','custom_trials','policy_assignments',
] as const;

type Row = {
  scenario: 'A_sees_B' | 'B_sees_A';
  table: string;
  leaked_rows: number | null;
  error: string | null;
};

const EVIDENCE_DIR = resolve(
  __dirname,
  '../../docs/audits/active/evidence/P0-01-rls'
);

describe('P0-01 · Cross-tenant RLS isolation', () => {
  const cfg = validateTenantTestConfig();

  beforeAll(() => {
    if (!cfg.valid) {
      // eslint-disable-next-line no-console
      console.warn(
        `[P0-01] Skipping — missing env vars: ${cfg.missing.join(', ')}`
      );
    }
    mkdirSync(EVIDENCE_DIR, { recursive: true });
  });

  it.skipIf(!cfg.valid)(
    'no cross-tenant leaks across all multi-tenant tables',
    async () => {
      const results: Row[] = [];
      const [clientA, clientB] = await Promise.all([
        createTenantAClient(),
        createTenantBClient(),
      ]);

      const scenarios = [
        {
          name: 'A_sees_B' as const,
          client: clientA,
          otherTenant: TENANT_CONFIG.tenantB.id,
        },
        {
          name: 'B_sees_A' as const,
          client: clientB,
          otherTenant: TENANT_CONFIG.tenantA.id,
        },
      ];

      for (const s of scenarios) {
        for (const table of MULTI_TENANT_TABLES) {
          const { count, error } = await s.client
            .from(table)
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            .select('*', { count: 'exact', head: true } as any)
            .eq('tenant_id', s.otherTenant);
          results.push({
            scenario: s.name,
            table,
            leaked_rows: error ? null : count ?? 0,
            error: error?.message ?? null,
          });
        }
      }

      const leaks = results.filter(r => (r.leaked_rows ?? 0) > 0);
      const summary = {
        generated_at: new Date().toISOString(),
        tenant_a: TENANT_CONFIG.tenantA.id,
        tenant_b: TENANT_CONFIG.tenantB.id,
        total_probes: results.length,
        clean: results.filter(r => r.leaked_rows === 0).length,
        leaked: leaks.length,
        errored: results.filter(r => r.error !== null).length,
        leaks,
        results,
      };

      writeFileSync(
        resolve(EVIDENCE_DIR, 'report.json'),
        JSON.stringify(summary, null, 2)
      );

      const afterSql = [
        '-- P0-01 · cross-tenant probe (executed by tests/security/cross-tenant-rls.spec.ts)',
        `-- Generated at: ${summary.generated_at}`,
        `-- Tenant A: ${TENANT_CONFIG.tenantA.id}`,
        `-- Tenant B: ${TENANT_CONFIG.tenantB.id}`,
        '',
        ...scenarios.flatMap(s =>
          MULTI_TENANT_TABLES.map(
            t =>
              `-- ${s.name}\nSELECT count(*) FROM public.${t} WHERE tenant_id = '${s.otherTenant}'; -- expected: 0`
          )
        ),
      ].join('\n');
      writeFileSync(resolve(EVIDENCE_DIR, 'after.sql'), afterSql);

      expect(leaks, `cross-tenant leaks: ${JSON.stringify(leaks)}`).toEqual([]);
    },
    120_000
  );
});
