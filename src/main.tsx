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

const PREVIEW_SW_RESET_KEY = "preview-sw-reset-v1";

async function resetPreviewCacheIfNeeded() {
  if (typeof window === "undefined") return;

  const isLovablePreview = /preview--/.test(window.location.hostname);
  if (!isLovablePreview) return;

  let shouldReload = false;

  if ("serviceWorker" in navigator) {
    const registrations = await navigator.serviceWorker.getRegistrations();
    if (registrations.length > 0) {
      shouldReload = true;
      await Promise.all(registrations.map((registration) => registration.unregister()));
    }
  }

  if ("caches" in window) {
    const cacheKeys = await caches.keys();
    if (cacheKeys.length > 0) {
      shouldReload = true;
      await Promise.all(cacheKeys.map((key) => caches.delete(key)));
    }
  }

  if (shouldReload && !sessionStorage.getItem(PREVIEW_SW_RESET_KEY)) {
    sessionStorage.setItem(PREVIEW_SW_RESET_KEY, "1");
    window.location.reload();
  }
}

// QueryClient with optimized cache configuration (APEX optimization)
const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 5 * 60 * 1000, // 5 minutes - data stays fresh
      gcTime: 10 * 60 * 1000, // 10 minutes - cache persists in memory
      refetchOnWindowFocus: false, // Disable aggressive refetching
      refetchOnReconnect: true, // Refetch on network reconnect
      retry: 1, // Only retry once on failure
    },
  },
});

async function bootstrap() {
  await resetPreviewCacheIfNeeded();

  createRoot(document.getElementById("root")!).render(
    <React.StrictMode>
      <HelmetProvider>
        <ThemeProvider
          attribute="class"
          defaultTheme="dark"
          enableSystem={false}
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

void bootstrap();
