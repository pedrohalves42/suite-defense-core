/**
 * Playwright Global Setup
 *
 * Carrega variáveis de ambiente de .env.test (e .env.test.local quando presente)
 * antes de qualquer spec rodar. Isso garante que:
 *   - Helpers (security-test-helpers.ts) enxerguem VITE_SUPABASE_URL / KEY.
 *   - Fixtures (security-test-users.ts) resolvam credenciais sem hardcode.
 *   - O mesmo arquivo seja consumido localmente e no CI.
 *
 * Em CI, segredos sensíveis (SUPABASE_SERVICE_ROLE_KEY, senhas) devem ser
 * injetados como variáveis de ambiente reais — process.env tem precedência
 * sobre .env.test (override: false).
 */
import { config as loadEnv } from "dotenv";
import { existsSync } from "node:fs";
import { resolve } from "node:path";

export default async function globalSetup() {
  const root = process.cwd();
  const candidates = [".env.test", ".env.test.local"];
  for (const file of candidates) {
    const full = resolve(root, file);
    if (existsSync(full)) {
      loadEnv({ path: full, override: false });
      // eslint-disable-next-line no-console
      console.log(`[e2e/global-setup] loaded ${file}`);
    }
  }

  // Validação mínima para falhar cedo com mensagem clara.
  const required = ["VITE_SUPABASE_URL", "VITE_SUPABASE_PUBLISHABLE_KEY"];
  const missing = required.filter((k) => !process.env[k]);
  if (missing.length > 0) {
    throw new Error(
      `[e2e/global-setup] Variáveis ausentes: ${missing.join(", ")}. ` +
        `Crie .env.test (use .env.test.example como base) ou configure no CI.`,
    );
  }
}
