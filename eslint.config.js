import js from "@eslint/js";
import globals from "globals";
import reactHooks from "eslint-plugin-react-hooks";
import reactRefresh from "eslint-plugin-react-refresh";
import tseslint from "typescript-eslint";

export default tseslint.config(
  // 1. Global ignores for build directories
  { 
    ignores: [
      "dist", 
      "electron/dist", 
      "electron/web"
    ] 
  },
  
  // 2. Disable ALL linting for agent scripts (embedded shell/PowerShell syntax)
  {
    files: [
      "supabase/functions/_shared/agent-script-linux-content.ts",
      "supabase/functions/_shared/agent-script-macos-content.ts",
      "supabase/functions/_shared/agent-script-windows-content.ts"
    ],
    rules: {} // Empty rules object = no linting
  },
  
  // 3. Main configuration for all other TypeScript files
  {
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    files: ["**/*.{ts,tsx}"],
    ignores: [
      "supabase/functions/_shared/agent-script-*-content.ts"
    ],
    languageOptions: {
      ecmaVersion: 2020,
      globals: globals.browser,
    },
    plugins: {
      "react-hooks": reactHooks,
      "react-refresh": reactRefresh,
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
      
      // Novas regras úteis
      "@typescript-eslint/no-explicit-any": "warn",
      "no-console": ["warn", { allow: ["warn", "error"] }],
    },
  },
);
