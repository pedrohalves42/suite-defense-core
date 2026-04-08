// CyberShield - Security Dashboard v4.0
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Guard: check required env vars BEFORE any Supabase module executes
const _supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const _supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;

if (!_supabaseUrl || !_supabaseKey) {
  const root = document.getElementById("root");
  if (root) {
    root.innerHTML = `
      <div style="min-height:100vh;display:flex;align-items:center;justify-content:center;background:#0a0a0f;color:#e2e8f0;font-family:system-ui,sans-serif;padding:2rem;text-align:center">
        <div style="max-width:480px">
          <div style="font-size:3rem;margin-bottom:1rem">🛡️</div>
          <h1 style="font-size:1.5rem;font-weight:700;margin-bottom:.75rem;color:#f8fafc">CyberShield</h1>
          <p style="font-size:1rem;line-height:1.6;color:#94a3b8;margin-bottom:1.5rem">
            Configuração incompleta — variáveis de ambiente do backend não encontradas.
          </p>
          <p style="font-size:.85rem;color:#64748b">
            Contate o administrador do sistema ou republique a aplicação com as variáveis configuradas.
          </p>
        </div>
      </div>`;
  }
  // Stop execution — do NOT import App or Supabase modules
} else {
  // Only import heavy modules AFTER env vars are confirmed
  Promise.all([
    import("@tanstack/react-query"),
    import("next-themes"),
    import("react-helmet-async"),
    import("./hooks/useActiveTenant"),
    import("./App.tsx"),
    import("./lib/storage"),
    import("./i18n"),
  ]).then(
    ([
      { QueryClient, QueryClientProvider },
      { ThemeProvider },
      { HelmetProvider },
      { ActiveTenantProvider },
      { default: App },
      { startStorageCleanup },
    ]) => {
      // Start localStorage cleanup with teardown support
      startStorageCleanup();

      // Unconditionally purge legacy PWA artifacts (all environments)
      if ("serviceWorker" in navigator) {
        navigator.serviceWorker
          .getRegistrations()
          .then((regs) => regs.forEach((r) => r.unregister()));
      }
      if ("caches" in window) {
        caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
      }

      const DEPLOY_RECOVERY_KEY = "__cybershield_deploy_recovery__";
      const DEPLOY_RECOVERY_COOLDOWN_MS = 15_000;

      const recoverFromStaleAssets = () => {
        try {
          const lastAttempt = Number(
            sessionStorage.getItem(DEPLOY_RECOVERY_KEY) || "0"
          );
          if (Date.now() - lastAttempt < DEPLOY_RECOVERY_COOLDOWN_MS) {
            return;
          }
          sessionStorage.setItem(DEPLOY_RECOVERY_KEY, String(Date.now()));
          window.location.reload();
        } catch {
          window.location.reload();
        }
      };

      window.addEventListener("vite:preloadError", (event) => {
        (event as Event).preventDefault?.();
        recoverFromStaleAssets();
      });

      window.addEventListener("unhandledrejection", (event) => {
        const reason = (event as PromiseRejectionEvent).reason;
        const message =
          typeof reason?.message === "string"
            ? reason.message
            : String(reason || "");

        if (message.includes("Failed to fetch dynamically imported module")) {
          event.preventDefault?.();
          recoverFromStaleAssets();
        }
      });

      window.addEventListener(
        "error",
        (event) => {
          const target = event.target;
          if (
            !(
              target instanceof HTMLScriptElement ||
              target instanceof HTMLLinkElement
            )
          ) {
            return;
          }

          const assetUrl =
            target instanceof HTMLScriptElement ? target.src : target.href;
          if (assetUrl?.includes("/assets/")) {
            recoverFromStaleAssets();
          }
        },
        true
      );

      // QueryClient with optimized cache configuration (APEX optimization)
      const queryClient = new QueryClient({
        defaultOptions: {
          queries: {
            staleTime: 10 * 60 * 1000,
            gcTime: 15 * 60 * 1000,
            refetchOnWindowFocus: true,
            refetchOnReconnect: true,
            retry: 1,
          },
        },
      });

      createRoot(document.getElementById("root")!).render(
        <React.StrictMode>
          <HelmetProvider>
            <ThemeProvider
              attribute="class"
              defaultTheme="dark"
              enableSystem
              storageKey="intelligence-theme"
              disableTransitionOnChange
            >
              <QueryClientProvider client={queryClient}>
                <ActiveTenantProvider>
                  <App />
                </ActiveTenantProvider>
              </QueryClientProvider>
            </ThemeProvider>
          </HelmetProvider>
        </React.StrictMode>
      );
    }
  );
}
