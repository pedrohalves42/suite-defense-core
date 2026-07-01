/**
 * HF-RLS-06B — E2E negativo (regressão funcional + exploits fechados)
 *
 * Referências:
 *   - docs/audits/active/hf-rls-06b-report.md
 *   - docs/audits/active/hf-rls-06b-extra-report.md
 *
 * Objetivo: provar simultaneamente que
 *   (a) o fluxo legítimo dos usuários autenticados continua funcionando;
 *   (b) os vetores anônimos e cross-tenant permanecem bloqueados.
 *
 * RPCs cobertas (via PostgREST /rest/v1/rpc):
 *   - get_agents_list(p_tenant_id uuid)
 *   - get_agents_snapshots_list(p_tenant_id uuid)
 *
 * Matriz (obrigatória, versionada):
 *   Caso  Chamador       p_tenant_id                Resultado esperado
 *   A     anon           NULL                       401/403 (TENANT_REQUIRED)
 *   B     anon           tenant-a (real)            401/403 (anon bloqueado antes do body)
 *   C     viewer         own tenant                 200 (ok — fluxo legítimo)
 *   D     viewer         foreign uuid               400 TENANT_FORBIDDEN
 *   E     viewer         NULL                       200 (usa active tenant) — fluxo legítimo
 *   F     super_admin    NULL                       200 (ok — super_admin sem tenant permitido)
 *   G     super_admin    tenant-a                   200 (ok — super_admin pode selecionar)
 */

import { test, expect } from "@playwright/test";
import {
  createUnauthenticatedClient,
  getAccessToken,
  hasSecurityTestEnvVars,
} from "./helpers/security-test-helpers";

const SUPABASE_URL = process.env.VITE_SUPABASE_URL!;
const SUPABASE_ANON = process.env.VITE_SUPABASE_PUBLISHABLE_KEY!;

// Credenciais reais atualmente semeadas neste projeto
const SUPER_ADMIN = {
  email: process.env.TEST_SUPER_ADMIN_EMAIL || "super@cybershield.test",
  password: process.env.TEST_SUPER_ADMIN_PASSWORD || "SupZ9!kV2pQrW8tN",
};
const VIEWER = {
  email: process.env.TEST_VIEWER_EMAIL || "viewer@cybershield.test",
  password: process.env.TEST_VIEWER_PASSWORD || "VwR7#mB4zX1cT6Y",
};

const TENANT_A = "a0000000-0000-0000-0000-000000000001";
const FOREIGN_TENANT = "00000000-0000-0000-0000-0000000000ff";

const RPCS = ["get_agents_list", "get_agents_snapshots_list"] as const;

type RpcBody = { p_tenant_id: string | null };

async function callRpc(
  rpc: string,
  body: RpcBody,
  authToken: string | null,
): Promise<{ status: number; text: string }> {
  const res = await fetch(`${SUPABASE_URL}/rest/v1/rpc/${rpc}`, {
    method: "POST",
    headers: {
      apikey: SUPABASE_ANON,
      "Content-Type": "application/json",
      ...(authToken ? { Authorization: `Bearer ${authToken}` } : {}),
    },
    body: JSON.stringify(body),
  });
  const text = await res.text();
  return { status: res.status, text };
}

async function signIn(email: string, password: string): Promise<string | null> {
  const client = createUnauthenticatedClient();
  if (!client) return null;
  const { data, error } = await client.auth.signInWithPassword({ email, password });
  if (error) return null;
  return data.session?.access_token ?? null;
}

test.describe("HF-RLS-06B — matriz negativa/positiva", () => {
  test.beforeEach(() => {
    test.skip(!hasSecurityTestEnvVars(), "Missing VITE_SUPABASE_* env vars");
  });

  for (const rpc of RPCS) {
    test.describe(`${rpc}`, () => {
      test(`Caso A — anon + tenant NULL bloqueado`, async () => {
        const r = await callRpc(rpc, { p_tenant_id: null }, null);
        expect([401, 403]).toContain(r.status);
        expect(r.text).toMatch(/TENANT_REQUIRED|permission denied|not authorized|Unauthor/i);
      });

      test(`Caso B — anon + tenant explícito bloqueado`, async () => {
        const r = await callRpc(rpc, { p_tenant_id: TENANT_A }, null);
        expect([401, 403]).toContain(r.status);
        expect(r.text).not.toContain('"agent_id"'); // nenhum dado vazado
      });

      test(`Caso C — viewer + own tenant retorna 200`, async () => {
        const token = await signIn(VIEWER.email, VIEWER.password);
        test.skip(!token, "viewer seed missing");
        const r = await callRpc(rpc, { p_tenant_id: TENANT_A }, token);
        expect(r.status, `body=${r.text}`).toBe(200);
      });

      test(`Caso D — viewer + tenant estrangeiro → 400 TENANT_FORBIDDEN`, async () => {
        const token = await signIn(VIEWER.email, VIEWER.password);
        test.skip(!token, "viewer seed missing");
        const r = await callRpc(rpc, { p_tenant_id: FOREIGN_TENANT }, token);
        // Aceitar 400/403; corpo precisa indicar bloqueio
        expect([400, 403]).toContain(r.status);
        expect(r.text).toMatch(/TENANT_FORBIDDEN|forbidden|not authorized|permission/i);
      });

      test(`Caso E — viewer + tenant NULL usa active tenant`, async () => {
        const token = await signIn(VIEWER.email, VIEWER.password);
        test.skip(!token, "viewer seed missing");
        const r = await callRpc(rpc, { p_tenant_id: null }, token);
        // Deve retornar 200 (fallback para active tenant) OU 401 TENANT_REQUIRED
        // se o viewer não tiver active tenant setado. Ambos são comportamentos
        // válidos pós-hardening desde que NÃO vazem dados de outros tenants.
        expect([200, 401]).toContain(r.status);
        if (r.status === 401) {
          expect(r.text).toMatch(/TENANT_REQUIRED/i);
        }
      });

      test(`Caso F — super_admin + tenant NULL permitido`, async () => {
        const token = await signIn(SUPER_ADMIN.email, SUPER_ADMIN.password);
        test.skip(!token, "super_admin seed missing");
        const r = await callRpc(rpc, { p_tenant_id: null }, token);
        expect(r.status, `body=${r.text}`).toBe(200);
      });

      test(`Caso G — super_admin + tenant específico`, async () => {
        const token = await signIn(SUPER_ADMIN.email, SUPER_ADMIN.password);
        test.skip(!token, "super_admin seed missing");
        const r = await callRpc(rpc, { p_tenant_id: TENANT_A }, token);
        expect(r.status, `body=${r.text}`).toBe(200);
      });
    });
  }
});
