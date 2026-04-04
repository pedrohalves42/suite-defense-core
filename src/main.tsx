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

const clearLegacyPWAArtifacts = () => {
  if (typeof window === "undefined") return;

  if ("serviceWorker" in navigator) {
    navigator.serviceWorker
      .getRegistrations()
      .then((registrations) => {
        registrations.forEach((registration) => {
          void registration.unregister();
        });
      })
      .catch(() => undefined);
  }

  if ("caches" in window) {
    const legacyCacheNames = ["workbox", "google-fonts-cache", "gstatic-fonts-cache"];

    caches
      .keys()
      .then((keys) => {
        keys
          .filter((key) => legacyCacheNames.some((name) => key.includes(name)))
          .forEach((key) => {
            void caches.delete(key);
          });
      })
      .catch(() => undefined);
  }
};

clearLegacyPWAArtifacts();

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
