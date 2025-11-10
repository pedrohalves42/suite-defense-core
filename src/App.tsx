import React from "react";
import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { TooltipProvider } from "@/components/ui/tooltip";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route } from "react-router-dom";
import { ProtectedRoute } from "./components/ProtectedRoute";
import { AdminLayout } from "./components/AdminLayout";
import { AppLayout } from "./components/AppLayout";
import { CookieConsent } from "./components/CookieConsent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Landing from "./pages/Landing";
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
import AgentMonitoring from "./pages/AgentMonitoring";
import AgentManagement from "./pages/AgentManagement";
import DataExport from "./pages/DataExport";
import AcceptInvite from "./pages/AcceptInvite";
import Terms from "./pages/Terms";
import Privacy from "./pages/Privacy";
import AuthDebug from "./pages/debug/AuthDebug";

const queryClient = new QueryClient();

const App = () => (
  <ErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <TooltipProvider>
        <Toaster />
        <Sonner />
        <BrowserRouter>
          <CookieConsent />
          <Routes>
            {/* Public Routes */}
            <Route path="/" element={<Landing />} />
            <Route path="/login" element={<Login />} />
            <Route path="/signup" element={<Signup />} />
            <Route path="/forgot-password" element={<ForgotPassword />} />
            <Route path="/update-password" element={<UpdatePassword />} />
            <Route path="/accept-invite" element={<AcceptInvite />} />
            <Route path="/terms" element={<Terms />} />
            <Route path="/privacy" element={<Privacy />} />
            
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
              
              {/* Admin Routes */}
              <Route path="/admin" element={<AdminLayout />}>
                <Route index element={<Dashboard />} />
                <Route path="dashboard" element={<Dashboard />} />
                <Route path="enrollment-keys" element={<EnrollmentKeys />} />
                <Route path="users" element={<Users />} />
                <Route path="tenants" element={<Tenants />} />
                <Route path="features" element={<TenantFeatures />} />
                <Route path="api-keys" element={<ApiKeys />} />
                <Route path="invites" element={<Invites />} />
                <Route path="members" element={<Members />} />
                <Route path="audit-logs" element={<AuditLogs />} />
                <Route path="settings" element={<Settings />} />
              </Route>
            </Route>
            
            {/* ADD ALL CUSTOM ROUTES ABOVE THE CATCH-ALL "*" ROUTE */}
            <Route path="*" element={<NotFound />} />
          </Routes>
        </BrowserRouter>
      </TooltipProvider>
    </QueryClientProvider>
  </ErrorBoundary>
);

export default App;
