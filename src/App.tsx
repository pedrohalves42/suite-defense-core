import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
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
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { AdminMFAGuard } from "./components/auth/AdminMFAGuard";
import { Server } from "lucide-react";

// Lazy route-level loading fallback
const RouteFallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <Server className="h-10 w-10 text-primary animate-pulse" />
  </div>
);

// ─── Public pages ───
const Landing = lazy(() => import("./pages/Landing"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Login = lazy(() => import("./pages/Login"));
const Signup = lazy(() => import("./pages/Signup"));
const ForgotPassword = lazy(() => import("./pages/ForgotPassword"));
const UpdatePassword = lazy(() => import("./pages/UpdatePassword"));
const ForcePasswordChange = lazy(() => import("./pages/ForcePasswordChange"));
const NotFound = lazy(() => import("./pages/NotFound"));
const AcceptInvite = lazy(() => import("./pages/AcceptInvite"));
const CheckoutSuccess = lazy(() => import("./pages/CheckoutSuccess"));
const CheckoutCancel = lazy(() => import("./pages/CheckoutCancel"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacidade = lazy(() => import("./pages/Privacidade"));
const VerificarLaudo = lazy(() => import("./pages/VerificarLaudo"));
const ApprovePage = lazy(() => import("./pages/ApprovePage"));
const TestComplianceGenerator = lazy(() => import("./pages/TestComplianceGenerator"));
const NoTenant = lazy(() => import("./pages/NoTenant"));
const Tutorials = lazy(() => import("./pages/Tutorials"));

// ─── Docs ───
const ExeBuild = lazy(() => import("./pages/docs/ExeBuild"));
const ClientOnboarding = lazy(() => import("./pages/docs/ClientOnboarding"));
const DocsExport = lazy(() => import("./pages/docs/DocsExport"));

// ─── Debug ───
const AuthDebug = lazy(() => import("./pages/debug/AuthDebug"));

// ─── App-level protected pages ───
const ServerDashboard = lazy(() => import("./pages/ServerDashboard"));
const VirusScans = lazy(() => import("./pages/VirusScans"));
const Quarantine = lazy(() => import("./pages/Quarantine"));
const AgentInstaller = lazy(() => import("./pages/AgentInstaller"));
const JobCreator = lazy(() => import("./pages/JobCreator"));
const AgentTest = lazy(() => import("./pages/AgentTest"));
const AgentMonitoring = lazy(() => import("./pages/AgentMonitoring"));
const AgentManagement = lazy(() => import("./pages/AgentManagement"));
const DataExport = lazy(() => import("./pages/DataExport"));

// ─── Admin pages ───
const NotificationChannels = lazy(() => import("./pages/admin/NotificationChannels"));
const EnrollmentKeys = lazy(() => import("./pages/admin/EnrollmentKeys"));
const Users = lazy(() => import("./pages/admin/Users"));
const Settings = lazy(() => import("./pages/admin/Settings"));
const AuditLogs = lazy(() => import("./pages/admin/AuditLogs"));
const Invites = lazy(() => import("./pages/admin/Invites"));
const TenantFeatures = lazy(() => import("./pages/admin/TenantFeatures"));
const Dashboard = lazy(() => import("./pages/admin/Dashboard"));
const ApiKeys = lazy(() => import("./pages/admin/ApiKeys"));
const Members = lazy(() => import("./pages/admin/Members"));
const PlanUpgrade = lazy(() => import("./pages/admin/PlanUpgradeNew"));
const Subscriptions = lazy(() => import("./pages/admin/Subscriptions"));
const SuperAdminTenants = lazy(() => import("./pages/admin/super/Tenants"));
const SuperAdminMetrics = lazy(() => import("./pages/admin/super/Metrics"));
const AgentMonitoringAdvanced = lazy(() => import("./pages/AgentMonitoringAdvanced"));
const SecurityDashboard = lazy(() => import("./pages/admin/SecurityDashboard"));
const SubscriptionAnalytics = lazy(() => import("./pages/admin/SubscriptionAnalytics"));
const UnitEconomics = lazy(() => import("./pages/admin/super/UnitEconomics"));
const CohortAnalysis = lazy(() => import("./pages/admin/super/CohortAnalysis"));
const RevenueProjections = lazy(() => import("./pages/admin/super/RevenueProjections"));
const SalesPipeline = lazy(() => import("./pages/admin/super/SalesPipeline"));
const PitchDeck = lazy(() => import("./pages/admin/super/PitchDeck"));
const RiskAnalysis = lazy(() => import("./pages/admin/super/RiskAnalysis"));
const RolloutPolicies = lazy(() => import("./pages/super-admin/RolloutPolicies"));
const TenantSuspensionManager = lazy(() => import("./pages/admin/TenantSuspensionManager"));
const StripeSetup = lazy(() => import("./pages/admin/StripeSetup"));
const DiagnosticsCenter = lazy(() => import("./pages/admin/DiagnosticsCenter"));
const BuildHealthDashboard = lazy(() => import("./pages/admin/BuildHealthDashboard"));
const SystemLogs = lazy(() => import("./pages/admin/SystemLogs"));
const Installations = lazy(() => import("./pages/admin/Installations"));
const Tenant = lazy(() => import("./pages/admin/Tenant"));
const AgentReleases = lazy(() => import("./pages/admin/AgentReleases"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const SecurityPolicies = lazy(() => import("./pages/admin/SecurityPolicies"));
const SecurityPoliciesAutoActions = lazy(() => import("./pages/admin/SecurityPoliciesAutoActions"));
const NotificationSettings = lazy(() => import("./pages/admin/NotificationSettings"));
const AIMetrics = lazy(() => import("./pages/admin/AIMetrics"));
const AIGovernance = lazy(() => import("./pages/admin/AIGovernance"));
const ApiDocumentation = lazy(() => import("./pages/admin/ApiDocumentation"));
const MyAccount = lazy(() => import("./pages/admin/MyAccount"));
const RealTimeSecurityDashboard = lazy(() => import("./pages/admin/RealTimeSecurityDashboard"));
const AutonomyDashboard = lazy(() => import("./pages/admin/AutonomyDashboard"));
const ActionCenterDashboard = lazy(() => import("./pages/admin/ActionCenterDashboard"));
const Automations = lazy(() => import("./pages/admin/Automations"));
const MFASetupRequired = lazy(() => import("./pages/admin/MFASetupRequired"));
const ExecutiveDashboard = lazy(() => import("./pages/admin/ExecutiveDashboard"));
const AlertResolutionCenter = lazy(() => import("./pages/admin/AlertResolutionCenter"));
const Tasks = lazy(() => import("./pages/admin/Tasks"));
const AutoRemediation = lazy(() => import("./pages/admin/AutoRemediation"));
const SiemExport = lazy(() => import("./pages/admin/SiemExport"));
const WhiteLabelSettings = lazy(() => import("./pages/admin/WhiteLabelSettings"));
const ItsmSettings = lazy(() => import("./pages/admin/ItsmSettings"));
const PlatformManagement = lazy(() => import("./pages/admin/PlatformManagement"));
const ThreatIntelligence = lazy(() => import("./pages/admin/ThreatIntelligence"));
const CustomTrials = lazy(() => import("./pages/admin/CustomTrials"));
const AgentCenter = lazy(() => import("./pages/admin/AgentCenter"));
const VulnerabilityCenter = lazy(() => import("./pages/admin/VulnerabilityCenter"));
const NetworkSecurityCenter = lazy(() => import("./pages/admin/NetworkSecurityCenter"));
const AssetSecurityCenter = lazy(() => import("./pages/admin/AssetSecurityCenter"));
const ThreatCenter = lazy(() => import("./pages/admin/ThreatCenter"));
const ThreatHunting = lazy(() => import("./pages/admin/ThreatHunting"));
const MitreAttackDashboard = lazy(() => import("./pages/admin/MitreAttackDashboard"));
const ShadowITDiscovery = lazy(() => import("./pages/admin/ShadowITDiscovery"));
const AttackSimulation = lazy(() => import("./pages/admin/AttackSimulation"));
const IdentitySecurity = lazy(() => import("./pages/admin/IdentitySecurity"));
const SecurityGraph = lazy(() => import("./pages/admin/SecurityGraph"));
const OnboardingWizard = lazy(() => import("./pages/admin/OnboardingWizard"));
const ComplianceHub = lazy(() => import("./pages/admin/ComplianceHub"));
const IntelligenceHub = lazy(() => import("./pages/admin/IntelligenceHub"));
const OperationsHub = lazy(() => import("./pages/admin/OperationsHub"));
const SecuritySettings = lazy(() => import("./pages/admin/SecuritySettings"));

// ─── Client pages ───
const ClientDashboard = lazy(() => import("./pages/client").then(m => ({ default: m.ClientDashboard })));
const ClientComputers = lazy(() => import("./pages/client").then(m => ({ default: m.ClientComputers })));
const ClientSecurityStatus = lazy(() => import("./pages/client").then(m => ({ default: m.ClientSecurityStatus })));
const ClientReports = lazy(() => import("./pages/client").then(m => ({ default: m.ClientReports })));
const ClientActivity = lazy(() => import("./pages/client").then(m => ({ default: m.ClientActivity })));
const MyProtection = lazy(() => import("./pages/client").then(m => ({ default: m.MyProtection })));
const ClientInstallWizard = lazy(() => import("./pages/client/ClientInstallWizard"));
const StatusPage = lazy(() => import("./pages/client/StatusPage"));

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
        <Suspense fallback={<RouteFallback />}>
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
            <Route path="/privacy" element={<Privacidade />} />
            <Route path="/privacidade" element={<Privacidade />} />
            <Route path="/verificar/:laudoId" element={<VerificarLaudo />} />
            <Route path="/verificar-laudo" element={<VerificarLaudo />} />
            <Route path="/approve" element={<ApprovePage />} />
            <Route path="/test-compliance" element={<TestComplianceGenerator />} />
            <Route path="/tutorials" element={<Tutorials />} />
            
            {/* Documentation Routes */}
            <Route path="/docs/exe-build" element={<ExeBuild />} />
            <Route path="/docs/onboarding" element={<ClientOnboarding />} />
            <Route path="/docs/installation" element={<ClientOnboarding />} />
            <Route path="/docs/export" element={<DocsExport />} />
            
            {/* Debug Routes - Protected */}
            <Route path="/debug/auth" element={<ProtectedRoute><AuthDebug /></ProtectedRoute>} />
            
            {/* Protected Routes with AppLayout */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/dashboard" element={<RouteErrorBoundary route="Dashboard"><ServerDashboard /></RouteErrorBoundary>} />
              <Route path="/jobs" element={<RouteErrorBoundary route="Jobs"><JobCreator /></RouteErrorBoundary>} />
              <Route path="/installer" element={<RouteErrorBoundary route="Installer"><AgentInstaller /></RouteErrorBoundary>} />
              <Route path="/virus-scans" element={<RouteErrorBoundary route="Virus Scans"><VirusScans /></RouteErrorBoundary>} />
              <Route path="/quarantine" element={<RouteErrorBoundary route="Quarantine"><Quarantine /></RouteErrorBoundary>} />
              <Route path="/agent-test" element={<RouteErrorBoundary route="Agent Test"><AgentTest /></RouteErrorBoundary>} />
              <Route path="/monitoring" element={<RouteErrorBoundary route="Monitoring"><AgentMonitoring /></RouteErrorBoundary>} />
              <Route path="/agents" element={<RouteErrorBoundary route="Agents"><AgentManagement /></RouteErrorBoundary>} />
              <Route path="/export" element={<RouteErrorBoundary route="Export"><DataExport /></RouteErrorBoundary>} />
              
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
                <Route path="agent-center" element={<AgentCenter />} />
                <Route path="agent-health" element={<Navigate to="/admin/agent-center?tab=health" replace />} />
                <Route path="diagnostics" element={<DiagnosticsCenter />} />
                
                {/* Hub Routes */}
                <Route path="compliance-hub" element={<ComplianceHub />} />
                <Route path="intelligence-hub" element={<IntelligenceHub />} />
                <Route path="operations-hub" element={<OperationsHub />} />
                
                {/* Compliance redirects to hub */}
                <Route path="soc2-compliance" element={<Navigate to="/admin/compliance-hub?tab=overview" replace />} />
                <Route path="system-audit" element={<Navigate to="/admin/compliance-hub?tab=evidence" replace />} />
                <Route path="compliance-timeline" element={<Navigate to="/admin/compliance-hub?tab=overview" replace />} />
                <Route path="compliance-automation" element={<Navigate to="/admin/compliance-hub?tab=procedures" replace />} />
                <Route path="governance" element={<Navigate to="/admin/compliance-hub?tab=procedures" replace />} />
                <Route path="governance-reports" element={<Navigate to="/admin/compliance-hub?tab=evidence" replace />} />
                <Route path="evidence-bundle" element={<Navigate to="/admin/compliance-hub?tab=evidence" replace />} />
                <Route path="playbooks" element={<Navigate to="/admin/compliance-hub?tab=procedures" replace />} />
                <Route path="risk-score" element={<Navigate to="/admin/compliance-hub?tab=risk" replace />} />
                <Route path="security-benchmark" element={<Navigate to="/admin/compliance-hub?tab=risk" replace />} />
                <Route path="ransomware-incident" element={<Navigate to="/admin/compliance-hub?tab=risk" replace />} />
                
                {/* Intelligence redirects to hub */}
                <Route path="ai-insights" element={<Navigate to="/admin/intelligence-hub?tab=insights" replace />} />
                <Route path="ai-actions" element={<Navigate to="/admin/intelligence-hub?tab=automation" replace />} />
                <Route path="ai-anomalies" element={<Navigate to="/admin/intelligence-hub?tab=automation" replace />} />
                <Route path="rules-management" element={<Navigate to="/admin/intelligence-hub?tab=automation" replace />} />
                <Route path="ai-feedback" element={<Navigate to="/admin/intelligence-hub?tab=governance" replace />} />
                <Route path="decision-audit" element={<Navigate to="/admin/intelligence-hub?tab=governance" replace />} />
                <Route path="insight-triage" element={<Navigate to="/admin/intelligence-hub?tab=insights" replace />} />
                <Route path="confidence-gap" element={<Navigate to="/admin/intelligence-hub?tab=insights" replace />} />
                <Route path="software-knowledge-base" element={<Navigate to="/admin/intelligence-hub?tab=knowledge" replace />} />
                
                {/* Operations redirects to hub */}
                <Route path="cron-health" element={<Navigate to="/admin/operations-hub?tab=health" replace />} />
                <Route path="system-health" element={<Navigate to="/admin/operations-hub?tab=health" replace />} />
                <Route path="jobs-health" element={<Navigate to="/admin/operations-hub?tab=health" replace />} />
                <Route path="job-health" element={<Navigate to="/admin/operations-hub?tab=health" replace />} />
                <Route path="installation-health" element={<Navigate to="/admin/operations-hub?tab=health" replace />} />
                <Route path="performance-metrics" element={<Navigate to="/admin/operations-hub?tab=performance" replace />} />
                <Route path="rate-limiting" element={<Navigate to="/admin/operations-hub?tab=performance" replace />} />
                <Route path="slo-dashboard" element={<Navigate to="/admin/operations-hub?tab=performance" replace />} />
                <Route path="system-operations" element={<Navigate to="/admin/operations-hub?tab=logs" replace />} />
                <Route path="system-logs" element={<Navigate to="/admin/operations-hub?tab=logs" replace />} />
                <Route path="dead-letter-queue" element={<Navigate to="/admin/operations-hub?tab=logs" replace />} />
                <Route path="enrollment-keys" element={<Navigate to="/super-admin/enrollment-keys" replace />} />
                <Route path="mass-reinstall" element={<Navigate to="/admin/operations-hub?tab=tools" replace />} />
                <Route path="jobs-v3-migration" element={<Navigate to="/admin/operations-hub?tab=tools" replace />} />
                
                {/* Remaining standalone routes */}
                <Route path="ai-metrics" element={<RouteErrorBoundary route="AI Metrics"><AIMetrics /></RouteErrorBoundary>} />
                <Route path="ai-governance" element={<RouteErrorBoundary route="AI Governance"><AIGovernance /></RouteErrorBoundary>} />
                <Route path="tenant" element={<RouteErrorBoundary route="Tenant"><Tenant /></RouteErrorBoundary>} />
                <Route path="software-inventory" element={<Navigate to="/admin/asset-security?tab=inventory" replace />} />
                <Route path="vulnerabilities" element={<Navigate to="/admin/vulnerability-center?tab=vulnerabilities" replace />} />
                <Route path="web-activity" element={<Navigate to="/admin/network-security?tab=web-activity" replace />} />
                <Route path="dns-filter" element={<Navigate to="/admin/network-security?tab=dns-filter" replace />} />
                <Route path="vulnerability-center" element={<RouteErrorBoundary route="Vulnerabilities"><VulnerabilityCenter /></RouteErrorBoundary>} />
                <Route path="network-security" element={<RouteErrorBoundary route="Network Security"><NetworkSecurityCenter /></RouteErrorBoundary>} />
                <Route path="asset-security" element={<RouteErrorBoundary route="Asset Security"><AssetSecurityCenter /></RouteErrorBoundary>} />
                <Route path="threat-center" element={<RouteErrorBoundary route="Threat Center"><ThreatCenter /></RouteErrorBoundary>} />
                <Route path="threat-hunting" element={<RouteErrorBoundary route="Threat Hunting"><ThreatHunting /></RouteErrorBoundary>} />
                <Route path="mitre-attack" element={<RouteErrorBoundary route="MITRE ATT&CK"><MitreAttackDashboard /></RouteErrorBoundary>} />
                <Route path="agent-timeline" element={<Navigate to="/admin/agent-center?tab=timeline" replace />} />
                <Route path="agent-releases" element={<RouteErrorBoundary route="Agent Releases"><AgentReleases /></RouteErrorBoundary>} />
                <Route path="agent-versions" element={<Navigate to="/admin/agent-center?tab=versions" replace />} />
                <Route path="reports" element={<RouteErrorBoundary route="Reports"><Reports /></RouteErrorBoundary>} />
                <Route path="security-policies" element={<RouteErrorBoundary route="Security Policies"><SecurityPolicies /></RouteErrorBoundary>} />
                <Route path="security-policies/auto-actions" element={<RouteErrorBoundary route="Auto Actions"><SecurityPoliciesAutoActions /></RouteErrorBoundary>} />
                <Route path="agent-groups" element={<Navigate to="/admin/agent-center?tab=groups" replace />} />
                <Route path="agent-tags" element={<Navigate to="/admin/agent-center?tab=tags" replace />} />
                <Route path="notification-settings" element={<RouteErrorBoundary route="Notifications"><NotificationSettings /></RouteErrorBoundary>} />
                <Route path="security-monitoring" element={<Navigate to="/admin/threat-center?tab=alerts" replace />} />
                <Route path="invites" element={<RouteErrorBoundary route="Invites"><Invites /></RouteErrorBoundary>} />
                <Route path="api-docs" element={<RouteErrorBoundary route="API Docs"><ApiDocumentation /></RouteErrorBoundary>} />
                <Route path="my-account" element={<RouteErrorBoundary route="My Account"><MyAccount /></RouteErrorBoundary>} />
                <Route path="automations" element={<RouteErrorBoundary route="Automations"><Automations /></RouteErrorBoundary>} />
                <Route path="archived-agents" element={<Navigate to="/admin/agent-center?tab=archived" replace />} />
                <Route path="alert-resolution" element={<RouteErrorBoundary route="Alert Resolution"><AlertResolutionCenter /></RouteErrorBoundary>} />
                <Route path="auto-remediation" element={<RouteErrorBoundary route="Auto Remediation"><AutoRemediation /></RouteErrorBoundary>} />
                <Route path="siem-export" element={<RouteErrorBoundary route="SIEM Export"><SiemExport /></RouteErrorBoundary>} />
                <Route path="white-label" element={<RouteErrorBoundary route="White Label"><WhiteLabelSettings /></RouteErrorBoundary>} />
                <Route path="itsm" element={<RouteErrorBoundary route="ITSM"><ItsmSettings /></RouteErrorBoundary>} />
                <Route path="platforms" element={<RouteErrorBoundary route="Platforms"><PlatformManagement /></RouteErrorBoundary>} />
                <Route path="threat-intelligence" element={<RouteErrorBoundary route="Threat Intelligence"><ThreatIntelligence /></RouteErrorBoundary>} />
                <Route path="shadow-it" element={<RouteErrorBoundary route="Shadow IT"><ShadowITDiscovery /></RouteErrorBoundary>} />
                <Route path="attack-simulation" element={<RouteErrorBoundary route="Attack Simulation"><AttackSimulation /></RouteErrorBoundary>} />
                <Route path="identity-security" element={<RouteErrorBoundary route="Identity Security"><IdentitySecurity /></RouteErrorBoundary>} />
                <Route path="security-graph" element={<RouteErrorBoundary route="Security Graph"><SecurityGraph /></RouteErrorBoundary>} />
                <Route path="software-risk" element={<Navigate to="/admin/vulnerability-center?tab=software-risk" replace />} />
                <Route path="data-exposure" element={<Navigate to="/admin/asset-security?tab=data-exposure" replace />} />
                <Route path="notification-channels" element={<RouteErrorBoundary route="Notification Channels"><NotificationChannels /></RouteErrorBoundary>} />
                <Route path="realtime-security" element={<RouteErrorBoundary route="Realtime Security"><RealTimeSecurityDashboard /></RouteErrorBoundary>} />
                <Route path="ai-autonomy" element={<RouteErrorBoundary route="AI Autonomy"><AutonomyDashboard /></RouteErrorBoundary>} />
                <Route path="tasks" element={<RouteErrorBoundary route="Tasks"><Tasks /></RouteErrorBoundary>} />
                <Route path="onboarding" element={<RouteErrorBoundary route="Onboarding"><OnboardingWizard /></RouteErrorBoundary>} />
                <Route path="security-settings" element={<RouteErrorBoundary route="Security Settings"><SecuritySettings /></RouteErrorBoundary>} />
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
                <Route path="install" element={<ClientInstallWizard />} />
                <Route path="status" element={<StatusPage />} />
              </Route>
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </ErrorBoundary>
);

export default App;
