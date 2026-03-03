
import { Toaster } from "@/components/ui/toaster";
import NotificationChannels from "@/pages/admin/NotificationChannels";
import { Toaster as Sonner } from "@/components/ui/sonner";
import PWAInstallPrompt from "@/components/pwa/PWAInstallPrompt";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/AdminLayout";
import { SuperAdminLayout } from "./components/SuperAdminLayout";
import { AppLayout } from "./components/AppLayout";
import { ClientLayout } from "./components/client/ClientLayout";
import { CookieConsent } from "./components/CookieConsent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Landing from "./pages/Landing";
import Pricing from "./pages/Pricing";
import ServerDashboard from "./pages/ServerDashboard";
import VirusScans from './pages/VirusScans';
import Quarantine from './pages/Quarantine';
import AgentInstaller from "./pages/AgentInstaller";
import JobCreator from "./pages/JobCreator";
import AgentTest from "./pages/AgentTest";
import Login from "./pages/Login";
import Signup from "./pages/Signup";
import ForgotPassword from "./pages/ForgotPassword";
import UpdatePassword from "./pages/UpdatePassword";
import ForcePasswordChange from "./pages/ForcePasswordChange";
import NotFound from "./pages/NotFound";
import EnrollmentKeys from "./pages/admin/EnrollmentKeys";
import Users from "./pages/admin/Users";
import Settings from "./pages/admin/Settings";
import AuditLogs from "./pages/admin/AuditLogs";
import Invites from "./pages/admin/Invites";

import TenantFeatures from "./pages/admin/TenantFeatures";
import Dashboard from "./pages/admin/Dashboard";
import ApiKeys from "./pages/admin/ApiKeys";
import Members from "./pages/admin/Members";
import PlanUpgrade from "./pages/admin/PlanUpgradeNew";
import Subscriptions from "./pages/admin/Subscriptions";
import SuperAdminTenants from "./pages/admin/super/Tenants";
import SuperAdminMetrics from "./pages/admin/super/Metrics";
import AgentMonitoring from "./pages/AgentMonitoring";
import AgentManagement from "./pages/AgentManagement";
import DataExport from "./pages/DataExport";
import AcceptInvite from "./pages/AcceptInvite";
import CheckoutSuccess from "./pages/CheckoutSuccess";
import CheckoutCancel from "./pages/CheckoutCancel";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import PropostaComercial from "./pages/PropostaComercial";
import Privacidade from "./pages/Privacidade";
import AuthDebug from "./pages/debug/AuthDebug";
import SecurityDashboard from "./pages/admin/SecurityDashboard";
import AgentMonitoringAdvanced from "./pages/AgentMonitoringAdvanced";
import ExeBuild from "./pages/docs/ExeBuild";
import ClientOnboarding from "./pages/docs/ClientOnboarding";
import SubscriptionAnalytics from "./pages/admin/SubscriptionAnalytics";
import UnitEconomics from "./pages/admin/super/UnitEconomics";
import CohortAnalysis from "./pages/admin/super/CohortAnalysis";
import RevenueProjections from "./pages/admin/super/RevenueProjections";
import SalesPipeline from "./pages/admin/super/SalesPipeline";
import PitchDeck from "./pages/admin/super/PitchDeck";
import RiskAnalysis from "./pages/admin/super/RiskAnalysis";
import RolloutPolicies from "./pages/super-admin/RolloutPolicies";
import TenantSuspensionManager from "./pages/admin/TenantSuspensionManager";
import StripeSetup from "./pages/admin/StripeSetup";
import DiagnosticsCenter from "./pages/admin/DiagnosticsCenter";
import BuildHealthDashboard from "./pages/admin/BuildHealthDashboard";
import CronHealthDashboard from "./pages/admin/CronHealthDashboard";
import SystemLogs from "./pages/admin/SystemLogs";
import AgentHealthMonitor from "./pages/admin/AgentHealthMonitor";
import AIInsights from "./pages/admin/AIInsights";
import AIActionApproval from "./pages/admin/AIActionApproval";
import Installations from "./pages/admin/Installations";
import Tenant from "./pages/admin/Tenant";
import JobsV3Migration from "./pages/admin/JobsV3Migration";
import InstallationHealth from "./pages/admin/InstallationHealth";
import PerformanceMetrics from "./pages/admin/PerformanceMetrics";
import SystemHealth from "./pages/admin/SystemHealth";
import SoftwareInventory from "./pages/admin/SoftwareInventory";
import VulnerabilityFindings from "./pages/admin/VulnerabilityFindings";
import WebActivity from "./pages/admin/WebActivity";
import DNSFilter from "./pages/admin/DNSFilter";
import AgentTimeline from "./pages/admin/AgentTimeline";
import AgentReleases from "./pages/admin/AgentReleases";
import AgentVersionMonitor from "./pages/admin/AgentVersionMonitor";
import Reports from "./pages/admin/Reports";
import CustomTrials from "./pages/admin/CustomTrials";
import RateLimitingStats from "./pages/admin/RateLimitingStats";
import DeadLetterQueue from "./pages/admin/DeadLetterQueue";
import SecurityPolicies from "./pages/admin/SecurityPolicies";
import SecurityPoliciesAutoActions from "./pages/admin/SecurityPoliciesAutoActions";
import AgentGroups from "./pages/admin/AgentGroups";
import AgentTags from "./pages/admin/AgentTags";
import NotificationSettings from "./pages/admin/NotificationSettings";
import SecurityMonitoring from "./pages/admin/SecurityMonitoring";
import MassReinstall from "./pages/admin/MassReinstall";
import AIMetrics from "./pages/admin/AIMetrics";
import AIGovernance from "./pages/admin/AIGovernance";
import ApiDocumentation from "./pages/admin/ApiDocumentation";
import MyAccount from "./pages/admin/MyAccount";
import SLODashboard from "./pages/admin/SLODashboard";
import SystemOperations from "./pages/admin/SystemOperations";
import ComplianceTimeline from "./pages/admin/ComplianceTimeline";
import VerificarLaudo from "./pages/VerificarLaudo";
import ApprovePage from "./pages/ApprovePage";
import TestComplianceGenerator from "./pages/TestComplianceGenerator";
import NoTenant from "./pages/NoTenant";
import RiskScore from "./pages/admin/RiskScore";
import Playbooks from "./pages/admin/Playbooks";
import DecisionAudit from "./pages/admin/DecisionAudit";
import RulesManagement from "./pages/admin/RulesManagement";
import RealTimeSecurityDashboard from "./pages/admin/RealTimeSecurityDashboard";
import AutonomyDashboard from "./pages/admin/AutonomyDashboard";
import SystemAudit from "./pages/admin/SystemAudit";
import AIAnomalies from "./pages/admin/AIAnomalies";
import SOC2Dashboard from "./pages/admin/SOC2Dashboard";
import JobsHealthDashboard from "./pages/admin/JobsHealthDashboard";
import SoftwareRiskDashboard from "./pages/admin/SoftwareRiskDashboard";
import SoftwareKnowledgeBase from "./pages/admin/SoftwareKnowledgeBase";
import ActionCenterDashboard from "./pages/admin/ActionCenterDashboard";
import Automations from "./pages/admin/Automations";
import ArchivedAgents from "./pages/admin/ArchivedAgents";
import {
  ClientDashboard, 
  ClientComputers, 
  ClientSecurityStatus, 
  ClientReports, 
  ClientActivity,
  MyProtection 
} from "./pages/client";
import MFASetupRequired from "./pages/admin/MFASetupRequired";
import ExecutiveDashboard from "./pages/admin/ExecutiveDashboard";
import AlertResolutionCenter from "./pages/admin/AlertResolutionCenter";
import InsightTriageCenter from "./pages/admin/InsightTriageCenter";
import ConfidenceGapDashboardPage from "./pages/admin/ConfidenceGapDashboard";
import Tasks from "./pages/admin/Tasks";
import Governance from "./pages/admin/Governance";
import GovernanceReports from "./pages/admin/GovernanceReports";
import EvidenceBundlePage from "./pages/admin/EvidenceBundlePage";
import AutoRemediation from "./pages/admin/AutoRemediation";
import SiemExport from "./pages/admin/SiemExport";
import WhiteLabelSettings from "./pages/admin/WhiteLabelSettings";
import ItsmSettings from "./pages/admin/ItsmSettings";
import PlatformManagement from "./pages/admin/PlatformManagement";
import ComplianceAutomation from "./pages/admin/ComplianceAutomation";
import ThreatIntelligence from "./pages/admin/ThreatIntelligence";
import { AdminMFAGuard } from "./components/auth/AdminMFAGuard";
import AIFeedbackDashboard from "./pages/admin/AIFeedbackDashboard";

const App = () => (
  <ErrorBoundary>
      <TooltipProvider>
      <Toaster />
      <Sonner />
      <PWAInstallPrompt />
        <BrowserRouter
          future={{
            v7_startTransition: true,
            v7_relativeSplatPath: true,
          }}
        >
        <CookieConsent />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/pricing" element={<Pricing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/force-password-change" element={<ProtectedRoute><ForcePasswordChange /></ProtectedRoute>} />
            <Route path="/no-tenant" element={<ProtectedRoute><NoTenant /></ProtectedRoute>} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            <Route path="/privacidade" element={<Privacidade />} />
            <Route path="/verificar/:laudoId" element={<VerificarLaudo />} />
            <Route path="/verificar-laudo" element={<VerificarLaudo />} />
            <Route path="/approve" element={<ApprovePage />} />
            <Route path="/test-compliance" element={<TestComplianceGenerator />} />
            <Route path="/proposta-comercial" element={<PropostaComercial />} />
            
            {/* Documentation Routes */}
            <Route path="/docs/exe-build" element={<ExeBuild />} />
            <Route path="/docs/onboarding" element={<ClientOnboarding />} />
            <Route path="/docs/installation" element={<ClientOnboarding />} />
            
            {/* Debug Routes - Protected */}
            <Route path="/debug/auth" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
            
            {/* Protected Routes with AppLayout */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<ServerDashboard />} />
              <Route path="/jobs" element={<JobCreator />} />
              <Route path="/installer" element={<AgentInstaller />} />
              <Route path="/virus-scans" element={<VirusScans />} />
              <Route path="/quarantine" element={<Quarantine />} />
              <Route path="/agent-test" element={<AgentTest />} />
              <Route path="/monitoring" element={<AgentMonitoring />} />
              <Route path="/agents" element={<AgentManagement />} />
              <Route path="/export" element={<DataExport />} />
              
              {/* MFA Setup Required Route - Outside Guard */}
              <Route path="/admin/setup-mfa-required" element={<MFASetupRequired />} />
              
              {/* Admin Routes (Tenant-specific) - Protected by MFA Guard */}
              <Route path="/admin" element={<AdminMFAGuard><AdminLayout /></AdminMFAGuard>}>
                <Route index element={<ActionCenterDashboard />} />
                <Route path="action-center" element={<ActionCenterDashboard />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="executive" element={<ExecutiveDashboard />} />
                <Route path="monitoring-advanced" element={<AgentMonitoringAdvanced />} />
                <Route path="members" element={<Members />} />
                <Route path="plan-upgrade" element={<PlanUpgrade />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="installations" element={<Installations />} />
                <Route path="agent-health" element={<AgentHealthMonitor />} />
                <Route path="diagnostics" element={<DiagnosticsCenter />} />
                <Route path="ai-insights" element={<AIInsights />} />
                <Route path="ai-actions" element={<AIActionApproval />} />
                <Route path="ai-metrics" element={<AIMetrics />} />
                <Route path="ai-governance" element={<AIGovernance />} />
                <Route path="ai-anomalies" element={<AIAnomalies />} />
                <Route path="system-logs" element={<SystemLogs />} />
                <Route path="tenant" element={<Tenant />} />
                <Route path="jobs-v3-migration" element={<JobsV3Migration />} />
                <Route path="installation-health" element={<InstallationHealth />} />
                <Route path="performance-metrics" element={<PerformanceMetrics />} />
                <Route path="system-health" element={<SystemHealth />} />
                <Route path="software-inventory" element={<SoftwareInventory />} />
                <Route path="vulnerabilities" element={<VulnerabilityFindings />} />
                <Route path="web-activity" element={<WebActivity />} />
                <Route path="dns-filter" element={<DNSFilter />} />
                <Route path="agent-timeline" element={<AgentTimeline />} />
                <Route path="agent-releases" element={<AgentReleases />} />
                <Route path="agent-versions" element={<AgentVersionMonitor />} />
                <Route path="reports" element={<Reports />} />
                <Route path="rate-limiting" element={<RateLimitingStats />} />
                <Route path="dead-letter-queue" element={<DeadLetterQueue />} />
                <Route path="security-policies" element={<SecurityPolicies />} />
                <Route path="security-policies/auto-actions" element={<SecurityPoliciesAutoActions />} />
                <Route path="agent-groups" element={<AgentGroups />} />
                <Route path="agent-tags" element={<AgentTags />} />
                <Route path="notification-settings" element={<NotificationSettings />} />
                <Route path="security-monitoring" element={<SecurityMonitoring />} />
                <Route path="mass-reinstall" element={<MassReinstall />} />
                <Route path="invites" element={<Invites />} />
                <Route path="api-docs" element={<ApiDocumentation />} />
                <Route path="my-account" element={<MyAccount />} />
                <Route path="slo-dashboard" element={<SLODashboard />} />
                <Route path="jobs-health" element={<JobsHealthDashboard />} />
                <Route path="system-operations" element={<SystemOperations />} />
                <Route path="compliance-timeline" element={<ComplianceTimeline />} />
                <Route path="risk-score" element={<RiskScore />} />
                <Route path="playbooks" element={<Playbooks />} />
                <Route path="notification-channels" element={<NotificationChannels />} />
                <Route path="decision-audit" element={<DecisionAudit />} />
                <Route path="rules-management" element={<RulesManagement />} />
                <Route path="realtime-security" element={<RealTimeSecurityDashboard />} />
                <Route path="ai-autonomy" element={<AutonomyDashboard />} />
                <Route path="system-audit" element={<SystemAudit />} />
                <Route path="soc2-compliance" element={<SOC2Dashboard />} />
                <Route path="software-risk" element={<SoftwareRiskDashboard />} />
                <Route path="software-knowledge-base" element={<SoftwareKnowledgeBase />} />
                <Route path="automations" element={<Automations />} />
                <Route path="archived-agents" element={<ArchivedAgents />} />
                <Route path="alert-resolution" element={<AlertResolutionCenter />} />
                <Route path="insight-triage" element={<InsightTriageCenter />} />
                <Route path="confidence-gap" element={<ConfidenceGapDashboardPage />} />
                <Route path="job-health" element={<Navigate to="/admin/jobs-health" replace />} />
                <Route path="tasks" element={<Tasks />} />
                <Route path="governance" element={<Governance />} />
                <Route path="governance-reports" element={<GovernanceReports />} />
                <Route path="evidence-bundle" element={<EvidenceBundlePage />} />
                <Route path="auto-remediation" element={<AutoRemediation />} />
                <Route path="siem-export" element={<SiemExport />} />
                <Route path="ai-feedback" element={<AIFeedbackDashboard />} />
                <Route path="white-label" element={<WhiteLabelSettings />} />
                <Route path="itsm" element={<ItsmSettings />} />
                <Route path="platforms" element={<PlatformManagement />} />
                <Route path="compliance-automation" element={<ComplianceAutomation />} />
                <Route path="threat-intelligence" element={<ThreatIntelligence />} />
                <Route path="cron-health" element={<CronHealthDashboard />} />
              </Route>

              {/* Super Admin Routes (System-wide) - Protected by MFA Guard */}
              <Route path="/super-admin" element={<AdminMFAGuard><SuperAdminLayout /></AdminMFAGuard>}>
                <Route index element={<SuperAdminTenants />} />
                <Route path="tenants" element={<SuperAdminTenants />} />
                <Route path="metrics" element={<SuperAdminMetrics />} />
                <Route path="subscription-analytics" element={<SubscriptionAnalytics />} />
                <Route path="stripe-setup" element={<StripeSetup />} />
                <Route path="users" element={<Users />} />
                <Route path="features" element={<TenantFeatures />} />
                <Route path="api-keys" element={<ApiKeys />} />
                <Route path="enrollment-keys" element={<EnrollmentKeys />} />
                <Route path="invites" element={<Invites />} />
                <Route path="security" element={<SecurityDashboard />} />
                <Route path="audit-logs" element={<AuditLogs />} />
                <Route path="settings" element={<Settings />} />
                <Route path="agent-troubleshooting" element={<Navigate to="/admin/diagnostics" replace />} />
                <Route path="build-health" element={<BuildHealthDashboard />} />
                <Route path="system-logs" element={<SystemLogs />} />
                <Route path="custom-trials" element={<CustomTrials />} />
                <Route path="unit-economics" element={<UnitEconomics />} />
                <Route path="cohort-analysis" element={<CohortAnalysis />} />
                <Route path="revenue-projections" element={<RevenueProjections />} />
                <Route path="sales-pipeline" element={<SalesPipeline />} />
                <Route path="pitch-deck" element={<PitchDeck />} />
                <Route path="risk-analysis" element={<RiskAnalysis />} />
                <Route path="rollout-policies" element={<RolloutPolicies />} />
                <Route path="tenant-suspension" element={<TenantSuspensionManager />} />
              </Route>

              {/* Client Routes (Viewers/Operators) */}
              <Route path="/client" element={<ClientLayout />}>
                <Route index element={<MyProtection />} />
                <Route path="protection" element={<MyProtection />} />
                <Route path="dashboard" element={<ClientDashboard />} />
                <Route path="computers" element={<ClientComputers />} />
                <Route path="security" element={<ClientSecurityStatus />} />
                <Route path="reports" element={<ClientReports />} />
                <Route path="activity" element={<ClientActivity />} />
              </Route>
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
      </BrowserRouter>
    </TooltipProvider>
  </ErrorBoundary>
);

export default App;
