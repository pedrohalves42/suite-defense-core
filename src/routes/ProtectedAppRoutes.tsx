import { lazy } from "react";
import { Routes, Route } from "react-router-dom";

const ServerDashboard = lazy(() => import("@/pages/ServerDashboard"));
const VirusScans = lazy(() => import("@/pages/VirusScans"));
const Quarantine = lazy(() => import("@/pages/Quarantine"));
const AgentInstaller = lazy(() => import("@/pages/AgentInstaller"));
const JobCreator = lazy(() => import("@/pages/JobCreator"));
const AgentTest = lazy(() => import("@/pages/AgentTest"));
const AgentMonitoring = lazy(() => import("@/pages/AgentMonitoring"));
const AgentManagement = lazy(() => import("@/pages/AgentManagement"));
const DataExport = lazy(() => import("@/pages/DataExport"));
const MFASetupRequired = lazy(() => import("@/pages/admin/MFASetupRequired"));

export default function ProtectedAppRoutes() {
  return (
    <Routes>
      <Route path="dashboard" element={<ServerDashboard />} />
      <Route path="jobs" element={<JobCreator />} />
      <Route path="installer" element={<AgentInstaller />} />
      <Route path="virus-scans" element={<VirusScans />} />
      <Route path="quarantine" element={<Quarantine />} />
      <Route path="agent-test" element={<AgentTest />} />
      <Route path="monitoring" element={<AgentMonitoring />} />
      <Route path="agents" element={<AgentManagement />} />
      <Route path="export" element={<DataExport />} />
      <Route path="admin/setup-mfa-required" element={<MFASetupRequired />} />
    </Routes>
  );
}
