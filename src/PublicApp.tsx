/**
 * PublicApp — Minimal shell rendered when backend env vars are missing.
 * Only exposes static/public routes that don't depend on Supabase.
 * IMPORTANT: Do NOT import any page/component that imports the Supabase client.
 */
import { Component, ErrorInfo, ReactNode, Suspense, lazy } from "react";
import { BrowserRouter, Routes, Route, Navigate } from "react-router-dom";
import { HelmetProvider } from "react-helmet-async";
import { ThemeProvider } from "next-themes";
import { Toaster } from "@/components/ui/toaster";
import { TooltipProvider } from "@/components/ui/tooltip";
import { CookieConsent } from "./components/CookieConsent";

const Landing = lazy(() => import("./pages/Landing"));
const Terms = lazy(() => import("./pages/Terms"));
const Privacidade = lazy(() => import("./pages/Privacidade"));
const Security = lazy(() => import("./pages/Security"));
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

interface PublicErrorBoundaryProps {
  children: ReactNode;
}

interface PublicErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class PublicErrorBoundary extends Component<
  PublicErrorBoundaryProps,
  PublicErrorBoundaryState
> {
  public state: PublicErrorBoundaryState = {
    hasError: false,
    error: null,
  };

  public static getDerivedStateFromError(error: Error): PublicErrorBoundaryState {
    return { hasError: true, error };
  }

  public componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("[PublicErrorBoundary] CRASH:", error);
    console.error("[PublicErrorBoundary] Stack:", error.stack);
    console.error("[PublicErrorBoundary] Component stack:", errorInfo.componentStack);
  }

  public render() {
    if (!this.state.hasError) {
      return this.props.children;
    }

    return (
      <div className="min-h-screen bg-background flex items-center justify-center p-4">
        <div className="max-w-md w-full text-center space-y-6 rounded-xl border border-border bg-card p-6 text-card-foreground shadow-sm">
          <div className="mx-auto flex h-16 w-16 items-center justify-center rounded-full bg-destructive/10 text-destructive">
            <svg xmlns="http://www.w3.org/2000/svg" width="28" height="28" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round"><path d="M10.29 3.86L1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z"/><line x1="12" y1="9" x2="12" y2="13"/><line x1="12" y1="17" x2="12.01" y2="17"/></svg>
          </div>

          <div className="space-y-2">
            <h1 className="text-2xl font-bold text-foreground">Algo deu errado</h1>
            <p className="text-sm text-muted-foreground">
              Você pode recarregar a página ou voltar ao início.
            </p>
          </div>

          {this.state.error && (
            <div className="max-h-48 overflow-auto rounded-lg bg-muted p-4 text-left">
              <p className="break-all text-xs font-mono text-muted-foreground">
                {this.state.error.toString()}
              </p>
              {this.state.error.stack && (
                <pre className="mt-2 whitespace-pre-wrap break-all text-[10px] font-mono text-muted-foreground/80">
                  {this.state.error.stack}
                </pre>
              )}
            </div>
          )}

          <div className="flex flex-col gap-3 sm:flex-row">
            <button
              type="button"
              onClick={() => window.location.reload()}
              className="inline-flex flex-1 items-center justify-center rounded-md border border-border bg-background px-4 py-3 text-sm font-medium text-foreground transition-colors hover:bg-muted"
            >
              Recarregar
            </button>
            <a
              href="/"
              className="inline-flex flex-1 items-center justify-center rounded-md bg-primary px-4 py-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
            >
              Voltar ao início
            </a>
          </div>
        </div>
      </div>
    );
  }
}

export default function PublicApp() {
  return (
    <HelmetProvider>
      <ThemeProvider attribute="class" defaultTheme="dark" enableSystem disableTransitionOnChange>
        <PublicErrorBoundary>
          <TooltipProvider>
            <BrowserRouter>
              <Suspense fallback={<Fallback />}>
                <Routes>
                  <Route path="/" element={<Landing />} />
                  <Route path="/pricing" element={<Pricing />} />
                  <Route path="/terms" element={<Terms />} />
                  <Route path="/privacy" element={<Privacidade />} />
                  <Route path="/privacidade" element={<Privacidade />} />
                  <Route path="/security" element={<Security />} />
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
        </PublicErrorBoundary>
      </ThemeProvider>
    </HelmetProvider>
  );
}

