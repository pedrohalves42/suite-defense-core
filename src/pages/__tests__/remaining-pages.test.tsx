/**
 * Phase 4: AI, Intelligence, Installation, Client & remaining pages
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

describe('AI & Intelligence Pages – Smoke Render', () => {
  smokeTest('AIMetrics', () => import('@/pages/admin/AIMetrics'));
  smokeTest('AIAnomalies', () => import('@/pages/admin/AIAnomalies'));
  smokeTest('AIFeedbackDashboard', () => import('@/pages/admin/AIFeedbackDashboard'));
  smokeTest('AIGovernance', () => import('@/pages/admin/AIGovernance'));
  smokeTest('IntelligenceHub', () => import('@/pages/admin/IntelligenceHub'));
  smokeTest('InsightTriageCenter', () => import('@/pages/admin/InsightTriageCenter'));
  smokeTest('ConfidenceGapDashboard', () => import('@/pages/admin/ConfidenceGapDashboard'));
  smokeTest('DecisionAudit', () => import('@/pages/admin/DecisionAudit'));
  smokeTest('AutonomyDashboard', () => import('@/pages/admin/AutonomyDashboard'));
  smokeTest('ActionCenterDashboard', () => import('@/pages/admin/ActionCenterDashboard'));
  smokeTest('ExecutiveDashboard', () => import('@/pages/admin/ExecutiveDashboard'));
  smokeTest('ProblematicAgentsManager', () => import('@/pages/admin/ProblematicAgentsManager'));
  smokeTest('SoftwareInventory', () => import('@/pages/admin/SoftwareInventory'));
  smokeTest('SoftwareKnowledgeBase', () => import('@/pages/admin/SoftwareKnowledgeBase'));
  smokeTest('SubscriptionAnalytics', () => import('@/pages/admin/SubscriptionAnalytics'));
});

describe('Installation Pages – Smoke Render', () => {
  smokeTest('Installations', () => import('@/pages/admin/Installations'));
  smokeTest('InstallationAnalytics', () => import('@/pages/admin/InstallationAnalytics'));
  smokeTest('InstallationHealth', () => import('@/pages/admin/InstallationHealth'));
  smokeTest('InstallationHealthOverview', () => import('@/pages/admin/InstallationHealthOverview'));
  smokeTest('InstallationLogsExplorer', () => import('@/pages/admin/InstallationLogsExplorer'));
  smokeTest('InstallationMetrics', () => import('@/pages/admin/InstallationMetrics'));
  smokeTest('InstallationPipelineMonitor', () => import('@/pages/admin/InstallationPipelineMonitor'));
  smokeTest('BuildHealthDashboard', () => import('@/pages/admin/BuildHealthDashboard'));
  smokeTest('MassReinstall', () => import('@/pages/admin/MassReinstall'));
  smokeTest('JobsV3Migration', () => import('@/pages/admin/JobsV3Migration'));
});

describe('Agent Modules – Smoke Render', () => {
  smokeTest('AgentMonitoring', () => import('@/pages/AgentMonitoring/index'));
  smokeTest('AgentMonitoringAdvanced', () => import('@/pages/AgentMonitoringAdvanced/index'));
  smokeTest('AgentManagement', () => import('@/pages/AgentManagement/index'));
  smokeTest('AgentInstaller', () => import('@/pages/AgentInstaller/index'));
  smokeTest('JobCreator', () => import('@/pages/JobCreator/index'));
  smokeTest('AgentTest', () => import('@/pages/AgentTest/index'));
});

describe('Client Pages – Smoke Render', () => {
  smokeTest('ClientDashboard', () => import('@/pages/client/ClientDashboard'));
  smokeTest('ClientComputers', () => import('@/pages/client/ClientComputers'));
  smokeTest('ClientActivity', () => import('@/pages/client/ClientActivity'));
  smokeTest('ClientReports', () => import('@/pages/client/ClientReports'));
  smokeTest('ClientSecurityStatus', () => import('@/pages/client/ClientSecurityStatus'));
  smokeTest('ClientInstallWizard', () => import('@/pages/client/ClientInstallWizard'));
  smokeTest('MyProtection', () => import('@/pages/client/MyProtection'));
  smokeTest('StatusPage', () => import('@/pages/client/StatusPage'));
});

describe('Docs & Debug Pages – Smoke Render', () => {
  smokeTest('ClientOnboarding', () => import('@/pages/docs/ClientOnboarding'));
  smokeTest('DocsExport', () => import('@/pages/docs/DocsExport'));
  smokeTest('ExeBuild', () => import('@/pages/docs/ExeBuild'));
  smokeTest('AuthDebug', () => import('@/pages/debug/AuthDebug'));
  smokeTest('TestComplianceGenerator', () => import('@/pages/TestComplianceGenerator'));
});
