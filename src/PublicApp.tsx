/**
 * PublicApp — Minimal shell rendered when backend env vars are missing.
 * Only exposes static/public routes that don't depend on Supabase.
 */
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookieConsent } from "./components/CookieConsent";
import { ErrorBoundary } from "./components/ErrorBoundary";
import Landing from "./pages/Landing";

const Terms = lazy(() => import("./pages/Terms"));
const Privacidade = lazy(() => import("./pages/Privacidade"));
const Pricing = lazy(() => import("./pages/Pricing"));
const Tutorials = lazy(() => import("./pages/Tutorials"));
const NotFound = lazy(() => import("./pages/NotFound"));

const Fallback = () => (
  <div className="min-h-screen bg-background flex items-center justify-center">
    <div className="h-10 w-10 rounded-full border-4 border-primary border-t-transparent animate-spin" />
  </div>
);

export default function PublicApp() {
  return (
    <HelmetProvider>
      <ErrorBoundary>
        <TooltipProvider>
          <BrowserRouter>
            <Suspense fallback={<Fallback />}>
              <Routes>
                <Route path="/" element={<Landing />} />
                <Route path="/pricing" element={<Pricing />} />
                <Route path="/terms" element={<Terms />} />
                <Route path="/privacy" element={<Privacidade />} />
                <Route path="/privacidade" element={<Privacidade />} />
                <Route path="/tutorials" element={<Tutorials />} />
                <Route path="/login" element={<Navigate to="/" replace />} />
                <Route path="/signup" element={<Navigate to="/" replace />} />
                <Route path="/dashboard" element={<Navigate to="/" replace />} />
                <Route path="/admin/*" element={<Navigate to="/" replace />} />
                <Route path="*" element={<NotFound />} />
              </Routes>
            </Suspense>
            <CookieConsent />
          </BrowserRouter>
          <Toaster />
        </TooltipProvider>
      </ErrorBoundary>
    </HelmetProvider>
  );
}

