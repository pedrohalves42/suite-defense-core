import { lazy } from "react";
import { Routes, Route, Navigate } from "react-router-dom";
import { RouteErrorBoundary } from "@/components/RouteErrorBoundary";
import ActionCenterDashboard from "@/pages/admin/ActionCenterDashboard";

const Dashboard = lazy(() => import("@/pages/admin/Dashboard"));
const ExecutiveDashboard = lazy(() => import("@/pages/admin/ExecutiveDashboard"));
const AgentMonitoringAdvanced = lazy(() => import("@/pages/AgentMonitoringAdvanced"));
const Members = lazy(() => import("@/pages/admin/Members"));
const PlanUpgrade = lazy(() => import("@/pages/admin/PlanUpgradeNew"));
const Subscriptions = lazy(() => import("@/pages/admin/Subscriptions"));
const Installations = lazy(() => import("@/pages/admin/Installations"));
const AgentCenter = lazy(() => import("@/pages/admin/AgentCenter"));
const DiagnosticsCenter = lazy(() => import("@/pages/admin/DiagnosticsCenter"));
const RuntimeDiagnostics = lazy(() => import("@/pages/admin/RuntimeDiagnostics"));
const ComplianceHub = lazy(() => import("@/pages/admin/ComplianceHub"));
const IntelligenceHub = lazy(() => import("@/pages/admin/IntelligenceHub"));
const OperationsHub = lazy(() => import("@/pages/admin/OperationsHub"));
const Settings = lazy(() => import("@/pages/admin/Settings"));
const AuditLogs = lazy(() => import("@/pages/admin/AuditLogs"));
const Invites = lazy(() => import("@/pages/admin/Invites"));
const ApiKeys = lazy(() => import("@/pages/admin/ApiKeys"));
const SecurityDashboard = lazy(() => import("@/pages/admin/SecurityDashboard"));
const Automations = lazy(() => import("@/pages/admin/Automations"));
const WhiteLabelSettings = lazy(() => import("@/pages/admin/WhiteLabelSettings"));
const ItsmSettings = lazy(() => import("@/pages/admin/ItsmSettings"));
const OnboardingWizard = lazy(() => import("@/pages/admin/OnboardingWizard"));
const SecuritySettings = lazy(() => import("@/pages/admin/SecuritySettings"));

export default function AdminRoutes() {
  return (
    <Routes>
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
      <Route path="runtime-diagnostics" element={<RouteErrorBoundary route="Runtime Diagnostics"><RuntimeDiagnostics /></RouteErrorBoundary>} />
      
      <Route path="compliance-hub" element={<ComplianceHub />} />
      <Route path="intelligence-hub" element={<IntelligenceHub />} />
      <Route path="operations-hub" element={<OperationsHub />} />
      
      <Route path="settings" element={<Settings />} />
      <Route path="audit-logs" element={<AuditLogs />} />
      <Route path="invites" element={<Invites />} />
      <Route path="api-keys" element={<ApiKeys />} />
      <Route path="security-dashboard" element={<SecurityDashboard />} />
      <Route path="automations" element={<Automations />} />
      <Route path="white-label" element={<WhiteLabelSettings />} />
      <Route path="itsm" element={<ItsmSettings />} />
      <Route path="onboarding" element={<OnboardingWizard />} />
      <Route path="security-settings" element={<SecuritySettings />} />
      
      {/* Redirects */}
      <Route path="soc2-compliance" element={<Navigate to="/admin/compliance-hub?tab=overview" replace />} />
    </Routes>
  );
}
