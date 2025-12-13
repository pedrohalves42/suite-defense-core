import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/AdminLayout";
import { SuperAdminLayout } from "./components/SuperAdminLayout";
import { AppLayout } from "./components/AppLayout";
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
import NotFound from "./pages/NotFound";
import EnrollmentKeys from "./pages/admin/EnrollmentKeys";
import Users from "./pages/admin/Users";
import Settings from "./pages/admin/Settings";
import AuditLogs from "./pages/admin/AuditLogs";
import Invites from "./pages/admin/Invites";
import Tenants from "./pages/admin/Tenants";
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
import StripeSetup from "./pages/admin/StripeSetup";
import AgentDiagnostics from "./pages/admin/AgentDiagnostics.tsx";
import AgentTroubleshooting from "./pages/admin/AgentTroubleshooting";
import ProblematicAgentsManager from "./pages/admin/ProblematicAgentsManager";
import AgentDiagnosticsUnified from "./pages/admin/AgentDiagnosticsUnified";
import BuildHealthDashboard from "./pages/admin/BuildHealthDashboard";
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
import AgentTimeline from "./pages/admin/AgentTimeline";
import AgentReleases from "./pages/admin/AgentReleases";
import Reports from "./pages/admin/Reports";
import CustomTrials from "./pages/admin/CustomTrials";
import RateLimitingStats from "./pages/admin/RateLimitingStats";
import DeadLetterQueue from "./pages/admin/DeadLetterQueue";
import SecurityPolicies from "./pages/admin/SecurityPolicies";
import NotificationSettings from "./pages/admin/NotificationSettings";
import SecurityMonitoring from "./pages/admin/SecurityMonitoring";
import MassReinstall from "./pages/admin/MassReinstall";
import AIMetrics from "./pages/admin/AIMetrics";
import ApiDocumentation from "./pages/admin/ApiDocumentation";

const App = () => (
  <ErrorBoundary>
      <TooltipProvider>
      <Toaster />
      <Sonner />
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
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/checkout/success" element={<CheckoutSuccess />} />
            <Route path="/checkout/cancel" element={<CheckoutCancel />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            
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
              
              {/* Admin Routes (Tenant-specific) */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="monitoring-advanced" element={<AgentMonitoringAdvanced />} />
                <Route path="members" element={<Members />} />
                <Route path="plan-upgrade" element={<PlanUpgrade />} />
                <Route path="subscriptions" element={<Subscriptions />} />
                <Route path="installations" element={<Installations />} />
                <Route path="agent-health" element={<AgentHealthMonitor />} />
                <Route path="agent-diagnostics" element={<AgentDiagnosticsUnified />} />
                <Route path="agent-troubleshooting" element={<AgentDiagnosticsUnified />} />
                <Route path="problematic-agents" element={<AgentDiagnosticsUnified />} />
                <Route path="ai-insights" element={<AIInsights />} />
                <Route path="ai-actions" element={<AIActionApproval />} />
                <Route path="ai-metrics" element={<AIMetrics />} />
                <Route path="system-logs" element={<SystemLogs />} />
                <Route path="tenant" element={<Tenant />} />
                <Route path="jobs-v3-migration" element={<JobsV3Migration />} />
                <Route path="installation-health" element={<InstallationHealth />} />
                <Route path="performance-metrics" element={<PerformanceMetrics />} />
                <Route path="system-health" element={<SystemHealth />} />
                <Route path="software-inventory" element={<SoftwareInventory />} />
                <Route path="vulnerabilities" element={<VulnerabilityFindings />} />
                <Route path="web-activity" element={<WebActivity />} />
                <Route path="agent-timeline" element={<AgentTimeline />} />
                <Route path="agent-releases" element={<AgentReleases />} />
                <Route path="reports" element={<Reports />} />
                <Route path="rate-limiting" element={<RateLimitingStats />} />
                <Route path="dead-letter-queue" element={<DeadLetterQueue />} />
                <Route path="security-policies" element={<SecurityPolicies />} />
                <Route path="notification-settings" element={<NotificationSettings />} />
                <Route path="security-monitoring" element={<SecurityMonitoring />} />
                <Route path="mass-reinstall" element={<MassReinstall />} />
                <Route path="invites" element={<Invites />} />
                <Route path="api-docs" element={<ApiDocumentation />} />
              </Route>

              {/* Super Admin Routes (System-wide) */}
              <Route path="/super-admin" element={<SuperAdminLayout />}>
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
                <Route path="agent-troubleshooting" element={<AgentTroubleshooting />} />
                <Route path="build-health" element={<BuildHealthDashboard />} />
                <Route path="system-logs" element={<SystemLogs />} />
                <Route path="custom-trials" element={<CustomTrials />} />
                <Route path="unit-economics" element={<UnitEconomics />} />
                <Route path="cohort-analysis" element={<CohortAnalysis />} />
                <Route path="revenue-projections" element={<RevenueProjections />} />
                <Route path="sales-pipeline" element={<SalesPipeline />} />
                <Route path="pitch-deck" element={<PitchDeck />} />
                <Route path="risk-analysis" element={<RiskAnalysis />} />
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
