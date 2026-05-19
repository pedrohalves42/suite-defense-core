import { lazy, Suspense } from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/AdminLayout";
import { SuperAdminLayout } from "./components/SuperAdminLayout";
import { AppLayout } from "./components/AppLayout";
import { CookieConsent } from "./components/CookieConsent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import { RouteErrorBoundary } from "./components/RouteErrorBoundary";
import { AdminMFAGuard } from "./components/auth/AdminMFAGuard";
import { DashboardSkeleton } from "./components/skeletons/DashboardSkeleton";
import Landing from "./pages/Landing";

// Lazy loading route subsets
const PublicRoutes = lazy(() => import("./routes/PublicRoutes"));
const DocumentationRoutes = lazy(() => import("./routes/DocumentationRoutes"));
const ProtectedAppRoutes = lazy(() => import("./routes/ProtectedAppRoutes"));
const AdminRoutes = lazy(() => import("./routes/AdminRoutes"));
const SuperAdminRoutes = lazy(() => import("./routes/SuperAdminRoutes"));
const DebugRoutes = lazy(() => import("./routes/DebugRoutes"));

const RouteFallback = () => <DashboardSkeleton />;

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
        <Suspense fallback={<RouteFallback />}>
          <Routes>
            {/* Landing is statically imported for performance and stability */}
            <Route path="/" element={<Landing />} />
            
            {/* Module-based route delegation */}
            <Route path="/*" element={<PublicRoutes />} />
            <Route path="/docs/*" element={<DocumentationRoutes />} />
            <Route path="/debug/*" element={<DebugRoutes />} />
            
            {/* Protected Scopes */}
            <Route element={<ProtectedRoute><AppLayout /></ProtectedRoute>}>
              <Route path="/*" element={<ProtectedAppRoutes />} />
              
              {/* Admin Scope */}
              <Route path="/admin" element={<AdminMFAGuard><AdminLayout /></AdminMFAGuard>}>
                <Route path="*" element={<AdminRoutes />} />
              </Route>
              
              {/* Super Admin Scope */}
              <Route path="/super-admin" element={<AdminMFAGuard><SuperAdminLayout /></AdminMFAGuard>}>
                <Route path="*" element={<SuperAdminRoutes />} />
              </Route>
            </Route>

            {/* Catch-all */}
            <Route path="*" element={<Navigate to="/" replace />} />
          </Routes>
        </Suspense>
      </BrowserRouter>
    </TooltipProvider>
  </ErrorBoundary>
);

export default App;
