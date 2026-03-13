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
const Privacy = lazy(() => import("./pages/Privacy"));
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
const CronHealthDashboard = lazy(() => import("./pages/admin/CronHealthDashboard"));
const SystemLogs = lazy(() => import("./pages/admin/SystemLogs"));
const AgentHealthMonitor = lazy(() => import("./pages/admin/AgentHealthMonitor"));
const AIInsights = lazy(() => import("./pages/admin/AIInsights"));
const AIActionApproval = lazy(() => import("./pages/admin/AIActionApproval"));
const Installations = lazy(() => import("./pages/admin/Installations"));
const Tenant = lazy(() => import("./pages/admin/Tenant"));
const JobsV3Migration = lazy(() => import("./pages/admin/JobsV3Migration"));
const InstallationHealth = lazy(() => import("./pages/admin/InstallationHealth"));
const PerformanceMetrics = lazy(() => import("./pages/admin/PerformanceMetrics"));
const SystemHealth = lazy(() => import("./pages/admin/SystemHealth"));
const SoftwareInventory = lazy(() => import("./pages/admin/SoftwareInventory"));
const VulnerabilityFindings = lazy(() => import("./pages/admin/VulnerabilityFindings"));
const WebActivity = lazy(() => import("./pages/admin/WebActivity"));
const DNSFilter = lazy(() => import("./pages/admin/DNSFilter"));
const AgentTimeline = lazy(() => import("./pages/admin/AgentTimeline"));
const AgentReleases = lazy(() => import("./pages/admin/AgentReleases"));
const AgentVersionMonitor = lazy(() => import("./pages/admin/AgentVersionMonitor"));
const Reports = lazy(() => import("./pages/admin/Reports"));
const CustomTrials = lazy(() => import("./pages/admin/CustomTrials"));
const RateLimitingStats = lazy(() => import("./pages/admin/RateLimitingStats"));
const DeadLetterQueue = lazy(() => import("./pages/admin/DeadLetterQueue"));
const SecurityPolicies = lazy(() => import("./pages/admin/SecurityPolicies"));
const SecurityPoliciesAutoActions = lazy(() => import("./pages/admin/SecurityPoliciesAutoActions"));
const AgentGroups = lazy(() => import("./pages/admin/AgentGroups"));
const AgentTags = lazy(() => import("./pages/admin/AgentTags"));
const NotificationSettings = lazy(() => import("./pages/admin/NotificationSettings"));
const SecurityMonitoring = lazy(() => import("./pages/admin/SecurityMonitoring"));
const MassReinstall = lazy(() => import("./pages/admin/MassReinstall"));
const AIMetrics = lazy(() => import("./pages/admin/AIMetrics"));
const AIGovernance = lazy(() => import("./pages/admin/AIGovernance"));
const ApiDocumentation = lazy(() => import("./pages/admin/ApiDocumentation"));
const MyAccount = lazy(() => import("./pages/admin/MyAccount"));
const SLODashboard = lazy(() => import("./pages/admin/SLODashboard"));
const SystemOperations = lazy(() => import("./pages/admin/SystemOperations"));
const ComplianceTimeline = lazy(() => import("./pages/admin/ComplianceTimeline"));
const RiskScore = lazy(() => import("./pages/admin/RiskScore"));
const Playbooks = lazy(() => import("./pages/admin/Playbooks"));
const DecisionAudit = lazy(() => import("./pages/admin/DecisionAudit"));
const RulesManagement = lazy(() => import("./pages/admin/RulesManagement"));
const RealTimeSecurityDashboard = lazy(() => import("./pages/admin/RealTimeSecurityDashboard"));
const AutonomyDashboard = lazy(() => import("./pages/admin/AutonomyDashboard"));
const SystemAudit = lazy(() => import("./pages/admin/SystemAudit"));
const AIAnomalies = lazy(() => import("./pages/admin/AIAnomalies"));
const SOC2Dashboard = lazy(() => import("./pages/admin/SOC2Dashboard"));
const JobsHealthDashboard = lazy(() => import("./pages/admin/JobsHealthDashboard"));
const SoftwareRiskDashboard = lazy(() => import("./pages/admin/SoftwareRiskDashboard"));
const SoftwareKnowledgeBase = lazy(() => import("./pages/admin/SoftwareKnowledgeBase"));
const ActionCenterDashboard = lazy(() => import("./pages/admin/ActionCenterDashboard"));
const Automations = lazy(() => import("./pages/admin/Automations"));
const ArchivedAgents = lazy(() => import("./pages/admin/ArchivedAgents"));
const MFASetupRequired = lazy(() => import("./pages/admin/MFASetupRequired"));
const ExecutiveDashboard = lazy(() => import("./pages/admin/ExecutiveDashboard"));
const AlertResolutionCenter = lazy(() => import("./pages/admin/AlertResolutionCenter"));
const InsightTriageCenter = lazy(() => import("./pages/admin/InsightTriageCenter"));
const ConfidenceGapDashboardPage = lazy(() => import("./pages/admin/ConfidenceGapDashboard"));
const Tasks = lazy(() => import("./pages/admin/Tasks"));
const Governance = lazy(() => import("./pages/admin/Governance"));
const GovernanceReports = lazy(() => import("./pages/admin/GovernanceReports"));
const EvidenceBundlePage = lazy(() => import("./pages/admin/EvidenceBundlePage"));
const AutoRemediation = lazy(() => import("./pages/admin/AutoRemediation"));
const SiemExport = lazy(() => import("./pages/admin/SiemExport"));
const WhiteLabelSettings = lazy(() => import("./pages/admin/WhiteLabelSettings"));
const ItsmSettings = lazy(() => import("./pages/admin/ItsmSettings"));
const PlatformManagement = lazy(() => import("./pages/admin/PlatformManagement"));
const ComplianceAutomation = lazy(() => import("./pages/admin/ComplianceAutomation"));
const ThreatIntelligence = lazy(() => import("./pages/admin/ThreatIntelligence"));
const AIFeedbackDashboard = lazy(() => import("./pages/admin/AIFeedbackDashboard"));
const AgentCenter = lazy(() => import("./pages/admin/AgentCenter"));
const DataExposure = lazy(() => import("./pages/admin/DataExposure"));
const ShadowITDiscovery = lazy(() => import("./pages/admin/ShadowITDiscovery"));
const AttackSimulation = lazy(() => import("./pages/admin/AttackSimulation"));
const IdentitySecurity = lazy(() => import("./pages/admin/IdentitySecurity"));
const SecurityGraph = lazy(() => import("./pages/admin/SecurityGraph"));
const RansomwareIncident = lazy(() => import("./pages/admin/RansomwareIncident"));
const SecurityBenchmark = lazy(() => import("./pages/admin/SecurityBenchmark"));

// ─── Client pages ───
const ClientDashboard = lazy(() => import("./pages/client").then(m => ({ default: m.ClientDashboard })));
const ClientComputers = lazy(() => import("./pages/client").then(m => ({ default: m.ClientComputers })));
const ClientSecurityStatus = lazy(() => import("./pages/client").then(m => ({ default: m.ClientSecurityStatus })));
const ClientReports = lazy(() => import("./pages/client").then(m => ({ default: m.ClientReports })));
const ClientActivity = lazy(() => import("./pages/client").then(m => ({ default: m.ClientActivity })));
const MyProtection = lazy(() => import("./pages/client").then(m => ({ default: m.MyProtection })));

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
            <Route path="/privacy" element={<Privacy />} />
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
                <Route path="agent-center" element={<AgentCenter />} />
                <Route path="agent-health" element={<Navigate to="/admin/agent-center?tab=health" replace />} />
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
                <Route path="agent-timeline" element={<Navigate to="/admin/agent-center?tab=timeline" replace />} />
                <Route path="agent-releases" element={<AgentReleases />} />
                <Route path="agent-versions" element={<Navigate to="/admin/agent-center?tab=versions" replace />} />
                <Route path="reports" element={<Reports />} />
                <Route path="rate-limiting" element={<RateLimitingStats />} />
                <Route path="dead-letter-queue" element={<DeadLetterQueue />} />
                <Route path="security-policies" element={<SecurityPolicies />} />
                <Route path="security-policies/auto-actions" element={<SecurityPoliciesAutoActions />} />
                <Route path="agent-groups" element={<Navigate to="/admin/agent-center?tab=groups" replace />} />
                <Route path="agent-tags" element={<Navigate to="/admin/agent-center?tab=tags" replace />} />
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
                <Route path="data-exposure" element={<DataExposure />} />
                <Route path="software-knowledge-base" element={<SoftwareKnowledgeBase />} />
                <Route path="automations" element={<Automations />} />
                <Route path="archived-agents" element={<Navigate to="/admin/agent-center?tab=archived" replace />} />
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
                <Route path="shadow-it" element={<ShadowITDiscovery />} />
                <Route path="attack-simulation" element={<AttackSimulation />} />
                <Route path="identity-security" element={<IdentitySecurity />} />
                <Route path="security-graph" element={<SecurityGraph />} />
                <Route path="ransomware-incident" element={<RansomwareIncident />} />
                <Route path="security-benchmark" element={<SecurityBenchmark />} />
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
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </ErrorBoundary>
);

export default App;
