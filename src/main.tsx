// CyberShield - Security Dashboard v4.0
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Import i18n early — it's independent of backend
import("./i18n");

// Check if backend env vars are available
const _supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const _supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
const hasBackend = Boolean(_supabaseUrl && _supabaseKey);

if (!hasBackend) {
  // ── PUBLIC-ONLY MODE ──
  // Backend env vars are missing. Render a minimal public shell so the
  // institutional site (landing, pricing, terms, etc.) remains accessible.
  import("./PublicApp").then(({ default: PublicApp }) => {
    createRoot(document.getElementById("root")!).render(
      <React.StrictMode>
        <PublicApp />
      </React.StrictMode>
    );
  });
} else {
  // ── FULL APP MODE ──
  // Only import heavy modules AFTER env vars are confirmed
  Promise.all([
    import("@tanstack/react-query"),
    import("next-themes"),
    import("react-helmet-async"),
    import("./hooks/useActiveTenant"),
    import("./App.tsx"),
    import("./lib/storage"),
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
