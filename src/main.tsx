// CyberShield - Security Dashboard v4.0
import React from "react";
import { createRoot } from "react-dom/client";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { ActiveTenantProvider } from "./hooks/useActiveTenant";
import App from "./App.tsx";
import "./i18n";
import "./index.css";

// Unconditionally purge legacy PWA artifacts (all environments)
if (typeof window !== "undefined") {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker.getRegistrations().then((regs) =>
      regs.forEach((r) => r.unregister())
    );
  }
  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((k) => caches.delete(k)));
  }

  const DEPLOY_RECOVERY_KEY = "__cybershield_deploy_recovery__";
  const DEPLOY_RECOVERY_COOLDOWN_MS = 15_000;

  const recoverFromStaleAssets = () => {
    try {
      const lastAttempt = Number(sessionStorage.getItem(DEPLOY_RECOVERY_KEY) || "0");
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
    event.preventDefault?.();
    recoverFromStaleAssets();
  });

  window.addEventListener(
    "unhandledrejection",
    (event) => {
      const reason = event.reason;
      const message = typeof reason?.message === "string" ? reason.message : String(reason || "");

      if (message.includes("Failed to fetch dynamically imported module")) {
        event.preventDefault?.();
        recoverFromStaleAssets();
      }
    }
  );

  window.addEventListener(
    "error",
    (event) => {
      const target = event.target;
      if (!(target instanceof HTMLScriptElement || target instanceof HTMLLinkElement)) {
        return;
      }

      const assetUrl = target instanceof HTMLScriptElement ? target.src : target.href;
      if (assetUrl?.includes("/assets/")) {
        recoverFromStaleAssets();
      }
    },
    true
  );
}

// QueryClient with optimized cache configuration (APEX optimization)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 10 * 60 * 1000, // COST-OPT-V9: 10 minutes - reduce refetches
      gcTime: 15 * 60 * 1000, // 15 minutes - cache persists in memory
      refetchOnWindowFocus: true, // Only refetch when user returns to tab
      refetchOnReconnect: true, // Refetch on network reconnect
      retry: 1, // Only retry once on failure
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
