/**
 * PublicApp — Minimal shell rendered when backend env vars are missing.
 * Only exposes static/public routes that don't depend on Supabase.
 * IMPORTANT: Do NOT import any page/component that imports the Supabase client.
 */
import { Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
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

/**
 * Lightweight fallback shown when /login or /signup is accessed
 * but the backend is not available (env vars missing).
 */
function BackendUnavailable() {
  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <div className="max-w-md w-full text-center space-y-6">
        <div className="mx-auto w-16 h-16 rounded-full bg-destructive/10 flex items-center justify-center">
          <svg xmlns="http://www.w3.org/2000/svg" width="32" height="32" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" className="text-destructive"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
        </div>
        <h1 className="text-2xl font-bold text-foreground">Sistema temporariamente indisponível</h1>
        <p className="text-muted-foreground">
          O servidor de autenticação não está acessível no momento. Por favor, tente novamente em alguns minutos.
        </p>
        <a
          href="/"
          className="inline-flex items-center justify-center rounded-md bg-primary px-6 py-3 text-sm font-medium text-primary-foreground hover:bg-primary/90 transition-colors"
        >
          Voltar ao início
        </a>
      </div>
    </div>
  );
}

export default function PublicApp() {
  return (
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
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
                  <Route path="/login" element={<BackendUnavailable />} />
                  <Route path="/signup" element={<BackendUnavailable />} />
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
      </ThemeProvider>
    </HelmetProvider>
  );
}

