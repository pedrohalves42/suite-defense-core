import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";
// ADR-026: Multi-tenant enforcement plugin
import multitenantPlugin from "../eslint-plugin-multitenant/dist/index.js";

export default tseslint.config(
  // 1. Global ignores for build directories
  { 
    ignores: [
      "dist", 
      "electron/dist", 
      "electron/web",
      "supabase/functions/_shared/agent-script-linux-content.ts",
      "supabase/functions/_shared/agent-script-macos-content.ts",
      "supabase/functions/_shared/agent-script-windows-content.ts",
    ] 
  },
  
  // 2. Main configuration for all TypeScript files
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "supabase/functions/_shared/agent-script-linux-content.ts",
      "supabase/functions/_shared/agent-script-macos-content.ts",
      "supabase/functions/_shared/agent-script-windows-content.ts",
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
      // ADR-026: Multi-tenant isolation enforcement
      "multitenant": multitenantPlugin,
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      "react-refresh/only-export-components": [
        "warn",
        { allowConstantExport: true }
      ],
      
      // Reativar regra importante
      "@typescript-eslint/no-unused-vars": [
        "warn",
        {
          "argsIgnorePattern": "^_",
          "varsIgnorePattern": "^_",
          "caughtErrorsIgnorePattern": "^_"
        }
      ],
      
      // Novas regras uteis
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
      
      // ADR-026: Enforce tenant isolation on multi-tenant tables
      "multitenant/no-supabase-query-without-tenant": "error",
    },
  },
);
