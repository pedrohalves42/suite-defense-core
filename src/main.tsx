// CyberShield - Security Dashboard v4.0
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Import i18n early — it's independent of backend
import "./i18n";

import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { ThemeProvider } from "next-themes";
import { HelmetProvider } from "react-helmet-async";
import { ActiveTenantProvider } from "@/hooks/useActiveTenant";
import { AuthProvider } from "@/providers/AuthProvider";
import { startStorageCleanup } from "@/lib/storage";
import App from "./App";
import PublicApp from "./PublicApp";

// Check if backend env vars are available
const _supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const _supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY || import.meta.env.VITE_SUPABASE_ANON_KEY;
const hasBackend = Boolean(_supabaseUrl && _supabaseKey);

const DEPLOY_RECOVERY_KEY = "__cybershield_deploy_recovery__";
const DEPLOY_RECOVERY_COOLDOWN_MS = 15_000;

const clearLegacyPWAArtifacts = () => {
  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) =>
        registrations.forEach((registration) => registration.unregister())
      );
  }

  if ("caches" in window) {
    caches.keys().then((keys) => keys.forEach((key) => caches.delete(key)));
  }
};

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

const installBootstrapRecoveryHandlers = () => {
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
};

clearLegacyPWAArtifacts();
installBootstrapRecoveryHandlers();

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      // FinOps: aumentar staleTime para reduzir refetches automáticos
      staleTime: 15 * 60 * 1000, // 15 min (era 10 min)
      gcTime: 30 * 60 * 1000,    // 30 min (era 15 min)
      refetchOnWindowFocus: false, // FinOps: evitar refetch ao focar a aba
      refetchOnReconnect: true,
      retry: 1,
    },
  },
});

const rootElement = document.getElementById("root");
if (rootElement) {
  const root = createRoot(rootElement);

  if (!hasBackend) {
    root.render(
      <React.StrictMode>
        <PublicApp />
      </React.StrictMode>
    );
  } else {
    startStorageCleanup();
    root.render(
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
              <AuthProvider>
                <ActiveTenantProvider>
                  <App />
                </ActiveTenantProvider>
              </AuthProvider>
            </QueryClientProvider>
          </ThemeProvider>
        </HelmetProvider>
      </React.StrictMode>
    );
  }
}
