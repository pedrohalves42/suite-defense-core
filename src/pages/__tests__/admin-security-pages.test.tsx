/**
 * Phase 3: Admin security & operations pages smoke tests
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

describe('Admin Security Pages – Smoke Render', () => {
  smokeTest('ThreatCenter', () => import('@/pages/admin/ThreatCenter'));
  smokeTest('ThreatHunting', () => import('@/pages/admin/ThreatHunting'));
  smokeTest('ThreatIntelligence', () => import('@/pages/admin/ThreatIntelligence'));
  smokeTest('VulnerabilityCenter', () => import('@/pages/admin/VulnerabilityCenter'));
  smokeTest('VulnerabilityFindings', () => import('@/pages/admin/VulnerabilityFindings'));
  smokeTest('RiskScore', () => import('@/pages/admin/RiskScore'));
  smokeTest('SecurityBenchmark', () => import('@/pages/admin/SecurityBenchmark'));
  smokeTest('SecurityPoliciesAutoActions', () => import('@/pages/admin/SecurityPoliciesAutoActions'));
  smokeTest('AttackSimulation', () => import('@/pages/admin/AttackSimulation'));
  smokeTest('MitreAttackDashboard', () => import('@/pages/admin/MitreAttackDashboard'));
  smokeTest('RealTimeSecurityDashboard', () => import('@/pages/admin/RealTimeSecurityDashboard'));
  smokeTest('IdentitySecurity', () => import('@/pages/admin/IdentitySecurity'));
  smokeTest('NetworkSecurityCenter', () => import('@/pages/admin/NetworkSecurityCenter'));
  smokeTest('AssetSecurityCenter', () => import('@/pages/admin/AssetSecurityCenter'));
  smokeTest('DataExposure', () => import('@/pages/admin/DataExposure'));
  smokeTest('DNSFilter', () => import('@/pages/admin/DNSFilter'));
  smokeTest('ShadowITDiscovery', () => import('@/pages/admin/ShadowITDiscovery'));
  smokeTest('WebActivity', () => import('@/pages/admin/WebActivity'));
  smokeTest('RansomwareIncident', () => import('@/pages/admin/RansomwareIncident'));
  smokeTest('AutoRemediation', () => import('@/pages/admin/AutoRemediation'));
  smokeTest('RulesManagement', () => import('@/pages/admin/RulesManagement'));
  smokeTest('Playbooks', () => import('@/pages/admin/Playbooks'));
  smokeTest('AlertResolutionCenter', () => import('@/pages/admin/AlertResolutionCenter'));
});

describe('Admin Operations Pages – Smoke Render', () => {
  smokeTest('OperationsHub', () => import('@/pages/admin/OperationsHub'));
  smokeTest('SystemLogs', () => import('@/pages/admin/SystemLogs'));
  smokeTest('SystemAudit', () => import('@/pages/admin/SystemAudit'));
  smokeTest('Automations', () => import('@/pages/admin/Automations'));
  smokeTest('Tasks', () => import('@/pages/admin/Tasks'));
  smokeTest('SiemExport', () => import('@/pages/admin/SiemExport'));
  smokeTest('DeadLetterQueue', () => import('@/pages/admin/DeadLetterQueue'));
  smokeTest('CronHealthDashboard', () => import('@/pages/admin/CronHealthDashboard'));
  smokeTest('JobsHealthDashboard', () => import('@/pages/admin/JobsHealthDashboard'));
  smokeTest('RateLimitingStats', () => import('@/pages/admin/RateLimitingStats'));
  smokeTest('PerformanceMetrics', () => import('@/pages/admin/PerformanceMetrics'));
  smokeTest('NotificationChannels', () => import('@/pages/admin/NotificationChannels'));
  smokeTest('ItsmSettings', () => import('@/pages/admin/ItsmSettings'));
  smokeTest('ApprovalRequests', () => import('@/pages/admin/ApprovalRequests'));
  smokeTest('WhiteLabelSettings', () => import('@/pages/admin/WhiteLabelSettings'));
  smokeTest('OnboardingWizard', () => import('@/pages/admin/OnboardingWizard'));
  smokeTest('MFASetupRequired', () => import('@/pages/admin/MFASetupRequired'));
  smokeTest('CustomTrials', () => import('@/pages/admin/CustomTrials'));
  smokeTest('TenantSuspensionManager', () => import('@/pages/admin/TenantSuspensionManager'));
  smokeTest('PlatformManagement', () => import('@/pages/admin/PlatformManagement'));
});
