// CyberShield - Security Dashboard v4.0
import React from "react";
import { createRoot } from "react-dom/client";
import "./index.css";

// Import i18n early — it's independent of backend
import "./i18n";

// Check if backend env vars are available
const _supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const _supabaseKey = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY;
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

const renderBootstrapError = (error: unknown) => {
  console.error("[Bootstrap] Critical failure:", error);
  const root = document.getElementById("root");
  if (root) {
    // SECURITY: Use textContent for error message to prevent XSS
    const errorDiv = document.createElement("div");
    errorDiv.style.cssText = "min-height: 100vh; display: flex; align-items: center; justify-content: center; background: #0a0a0a; color: #fff; font-family: system-ui, sans-serif; padding: 20px; text-align: center;";
    
    const container = document.createElement("div");
    container.style.width = "100%";
    container.style.maxWidth = "400px";
    
    const icon = document.createElement("div");
    icon.style.fontSize = "48px";
    icon.style.marginBottom = "20px";
    icon.textContent = "⚠️";
    
    const title = document.createElement("h1");
    title.style.cssText = "font-size: 20px; margin-bottom: 12px; font-weight: 600;";
    title.textContent = "Falha na Inicialização";
    
    const desc = document.createElement("p");
    desc.style.cssText = "font-size: 14px; color: #a1a1aa; margin-bottom: 24px; line-height: 1.5;";
    desc.textContent = "Ocorreu um erro ao carregar os componentes básicos do sistema. Isso pode ser um problema temporário de conexão.";
    
    const button = document.createElement("button");
    button.style.cssText = "background: #fff; color: #000; border: none; padding: 10px 20px; border-radius: 6px; font-size: 14px; font-weight: 500; cursor: pointer; transition: opacity 0.2s;";
    button.textContent = "Tentar Novamente";
    button.onclick = () => window.location.reload();
    
    const debug = document.createElement("div");
    debug.style.cssText = "margin-top: 24px; font-size: 10px; color: #3f3f46; font-family: monospace; word-break: break-all; opacity: 0.5;";
    debug.textContent = String(error);
    
    container.appendChild(icon);
    container.appendChild(title);
    container.appendChild(desc);
    container.appendChild(button);
    container.appendChild(debug);
    errorDiv.appendChild(container);
    
    root.innerHTML = "";
    root.appendChild(errorDiv);
  }
};

if (!hasBackend) {
  // ── PUBLIC-ONLY MODE ──
  import("./PublicApp")
    .then(({ default: PublicApp }) => {
      const rootElement = document.getElementById("root");
      if (!rootElement) return;
      
      createRoot(rootElement).render(
        <React.StrictMode>
          <PublicApp />
        </React.StrictMode>
      );
    })
    .catch(renderBootstrapError);
} else {
  // ── FULL APP MODE ──
  Promise.all([
    import("@tanstack/react-query"),
    import("next-themes"),
    import("react-helmet-async"),
    import("@/hooks/useActiveTenant"),
    import("@/providers/AuthProvider"),
    import("@/App"),
    import("@/lib/storage"),
  ])
    .then(
      ([
        { QueryClient, QueryClientProvider },
        { ThemeProvider },
        { HelmetProvider },
        { ActiveTenantProvider },
        { AuthProvider },
        { default: App },
        { startStorageCleanup },
      ]) => {
        startStorageCleanup();

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
        if (!rootElement) return;

        createRoot(rootElement).render(
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
    )
    .catch(renderBootstrapError);
}
