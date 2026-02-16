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
