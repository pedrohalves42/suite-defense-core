import { lazy } from "react";
import { Routes, Route } from "react-router-dom";

const Tenants = lazy(() => import("@/pages/admin/super/Tenants"));
const Metrics = lazy(() => import("@/pages/admin/super/Metrics"));
const UnitEconomics = lazy(() => import("@/pages/admin/super/UnitEconomics"));
const CohortAnalysis = lazy(() => import("@/pages/admin/super/CohortAnalysis"));
const RevenueProjections = lazy(() => import("@/pages/admin/super/RevenueProjections"));
const SalesPipeline = lazy(() => import("@/pages/admin/super/SalesPipeline"));
const PitchDeck = lazy(() => import("@/pages/admin/super/PitchDeck"));
const RiskAnalysis = lazy(() => import("@/pages/admin/super/RiskAnalysis"));
const PlatformManagement = lazy(() => import("@/pages/admin/PlatformManagement"));
const CustomTrials = lazy(() => import("@/pages/admin/CustomTrials"));

export default function SuperAdminRoutes() {
  return (
    <Routes>
      <Route path="tenants" element={<Tenants />} />
      <Route path="metrics" element={<Metrics />} />
      <Route path="unit-economics" element={<UnitEconomics />} />
      <Route path="cohort-analysis" element={<CohortAnalysis />} />
      <Route path="revenue-projections" element={<RevenueProjections />} />
      <Route path="sales-pipeline" element={<SalesPipeline />} />
      <Route path="pitch-deck" element={<PitchDeck />} />
      <Route path="risk-analysis" element={<RiskAnalysis />} />
      <Route path="platform" element={<PlatformManagement />} />
      <Route path="custom-trials" element={<CustomTrials />} />
    </Routes>
  );
}
