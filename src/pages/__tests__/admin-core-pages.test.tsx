/**
 * Phase 2: Admin core pages smoke tests
 */
import './page-mocks';
import { describe, it, expect } from 'vitest';
import { renderPage } from './page-test-helpers';
import { Suspense } from 'react';

function smokeTest(name: string, importFn: () => Promise<any>, route = '/') {
  it(`${name} renders without crashing`, async () => {
    const mod = await importFn();
    const Component = mod.default || mod[Object.keys(mod).find(k => k !== '__esModule') || ''];
    expect(() => renderPage(
      <Suspense fallback={<div>loading</div>}>
        <Component />
      </Suspense>,
      { route }
    )).not.toThrow();
  });
}

describe('Admin Core Pages – Smoke Render', () => {
  smokeTest('Dashboard', () => import('@/pages/admin/Dashboard'));
  smokeTest('Members', () => import('@/pages/admin/Members'));
  smokeTest('Settings', () => import('@/pages/admin/Settings'));
  smokeTest('MyAccount', () => import('@/pages/admin/MyAccount'));
  smokeTest('AuditLogs', () => import('@/pages/admin/AuditLogs'));
  smokeTest('SecuritySettings', () => import('@/pages/admin/SecuritySettings'));
  smokeTest('SecurityDashboard', () => import('@/pages/admin/SecurityDashboard'));
  smokeTest('AgentCenter', () => import('@/pages/admin/AgentCenter'));
  smokeTest('AgentHealthMonitor', () => import('@/pages/admin/AgentHealthMonitor'));
  smokeTest('AgentVersionMonitor', () => import('@/pages/admin/AgentVersionMonitor'));
  smokeTest('AgentTimeline', () => import('@/pages/admin/AgentTimeline'));
  smokeTest('AgentTags', () => import('@/pages/admin/AgentTags'));
  smokeTest('AgentReleases', () => import('@/pages/admin/AgentReleases'));
  smokeTest('ArchivedAgents', () => import('@/pages/admin/ArchivedAgents'));
  smokeTest('Incidents', () => import('@/pages/admin/Incidents'));
  smokeTest('Invites', () => import('@/pages/admin/Invites'));
  smokeTest('SOC2Dashboard', () => import('@/pages/admin/SOC2Dashboard'));
  smokeTest('ComplianceHub', () => import('@/pages/admin/ComplianceHub'));
  smokeTest('ComplianceAutomation', () => import('@/pages/admin/ComplianceAutomation'));
  smokeTest('Governance', () => import('@/pages/admin/Governance'));
  smokeTest('GovernanceReports', () => import('@/pages/admin/GovernanceReports'));
  smokeTest('Reports', () => import('@/pages/admin/Reports'));
  smokeTest('Users', () => import('@/pages/admin/Users'));
  smokeTest('Tenant', () => import('@/pages/admin/Tenant'));
  smokeTest('Tenants', () => import('@/pages/admin/Tenants'));
  smokeTest('TenantFeatures', () => import('@/pages/admin/TenantFeatures'));
  smokeTest('ApiKeys', () => import('@/pages/admin/ApiKeys'));
  smokeTest('ApiDocumentation', () => import('@/pages/admin/ApiDocumentation'));
  smokeTest('Subscriptions', () => import('@/pages/admin/Subscriptions'));
  smokeTest('PlanUpgrade', () => import('@/pages/admin/PlanUpgrade'));
  smokeTest('PlanUpgradeNew', () => import('@/pages/admin/PlanUpgradeNew'));
});
