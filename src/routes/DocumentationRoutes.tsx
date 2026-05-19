import { lazy } from "react";
import { Routes, Route } from "react-router-dom";

const ExeBuild = lazy(() => import("@/pages/docs/ExeBuild"));
const ClientOnboarding = lazy(() => import("@/pages/docs/ClientOnboarding"));
const DocsExport = lazy(() => import("@/pages/docs/DocsExport"));
const SystemArchitecture = lazy(() => import("@/pages/docs/SystemArchitecture"));

export default function DocumentationRoutes() {
  return (
    <Routes>
      <Route path="exe-build" element={<ExeBuild />} />
      <Route path="onboarding" element={<ClientOnboarding />} />
      <Route path="installation" element={<ClientOnboarding />} />
      <Route path="export" element={<DocsExport />} />
      <Route path="architecture" element={<SystemArchitecture />} />
    </Routes>
  );
}
