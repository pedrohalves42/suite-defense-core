import { defineConfig, loadEnv } from "vite";
import react from "@vitejs/plugin-react-swc";
import path from "path";
import { componentTagger } from "lovable-tagger";

const FALLBACK_SUPABASE_PROJECT_ID = "iavbnmduxpxhwubqrzzn";
const FALLBACK_SUPABASE_URL = `https://${FALLBACK_SUPABASE_PROJECT_ID}.supabase.co`;
const FALLBACK_SUPABASE_PUBLISHABLE_KEY =
  "eyJhbGciOiJIUzI1NiIsInR5cCI6IkpXVCJ9.eyJpc3MiOiJzdXBhYmFzZSIsInJlZiI6ImlhdmJubWR1eHB4aHd1YnFyenpuIiwicm9sZSI6ImFub24iLCJpYXQiOjE3NTk4NzkzMzIsImV4cCI6MjA3NTQ1NTMzMn0.79Bg6lX-ArhDGLeaUN7MPgChv4FQNJ_KcjdMa5IerWk";

function resolveSupabaseBuildConfig(mode: string) {
  const env = loadEnv(mode, process.cwd(), "");
  const projectIdFromUrl = env.VITE_SUPABASE_URL?.match(
    /^https:\/\/([^.]+)\.supabase\.co\/?$/
  )?.[1];
  const publishableKey =
    env.VITE_SUPABASE_PUBLISHABLE_KEY ||
    env.VITE_SUPABASE_ANON_KEY ||
    FALLBACK_SUPABASE_PUBLISHABLE_KEY;

  const projectId =
    env.VITE_SUPABASE_PROJECT_ID ||
    projectIdFromUrl ||
    FALLBACK_SUPABASE_PROJECT_ID;

  return {
    projectId,
    url: env.VITE_SUPABASE_URL || `https://${projectId}.supabase.co`,
    publishableKey,
  };
}

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const supabaseConfig = resolveSupabaseBuildConfig(mode);

  return {
    base: '/',
    define: {
      'import.meta.env.VITE_SUPABASE_PROJECT_ID': JSON.stringify(
        supabaseConfig.projectId
      ),
      'import.meta.env.VITE_SUPABASE_URL': JSON.stringify(
        supabaseConfig.url
      ),
      'import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY': JSON.stringify(
        supabaseConfig.publishableKey
      ),
    },
    server: {
      host: "::",
      port: 8080,
    },
    plugins: [
      react(),
      mode === "development" && componentTagger(),
    ].filter(Boolean),
    resolve: {
      alias: {
        "@": path.resolve(__dirname, "./src"),
      },
    },
    optimizeDeps: {
      include: ['jspdf', 'jspdf-autotable'],
    },
    build: {
      target: 'es2020',
      cssCodeSplit: false,
      minify: 'terser',
      terserOptions: {
        compress: {
          drop_console: true,
          drop_debugger: true,
          pure_funcs: ['console.log', 'console.info', 'console.debug'],
        },
      },
      rollupOptions: {
        output: {
          manualChunks: {
            pdf: ['jspdf', 'jspdf-autotable'],
            excel: ['exceljs'],
            'vendor-react': ['react', 'react-dom', 'react-router-dom'],
            'vendor-ui': ['@radix-ui/react-dialog', '@radix-ui/react-popover', '@radix-ui/react-select', '@radix-ui/react-tabs', '@radix-ui/react-tooltip', '@radix-ui/react-dropdown-menu'],
            'vendor-charts': ['recharts'],
            'vendor-query': ['@tanstack/react-query'],
            'vendor-motion': ['framer-motion'],
            'vendor-supabase': ['@supabase/supabase-js'],
            'vendor-i18n': ['i18next', 'react-i18next', 'i18next-browser-languagedetector'],
          },
        },
      },
    },
  };
});
