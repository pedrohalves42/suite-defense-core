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
 * Matriz (obrigatória, versionada) — comportamento validado em produção
 * após HF-RLS-06B-EXTRA + HF-RLS-06C (revoke EXECUTE de PUBLIC/anon):
 *   Caso  Chamador       p_tenant_id     Resultado observado
 *   A     anon           NULL            401 permission denied (grant layer, 06C)
 *   B     anon           tenant real     401 permission denied (grant layer, 06C)
 *   C     viewer         own tenant      200 (fluxo legítimo intacto)
 *   D     viewer         foreign uuid    400 TENANT_MISMATCH
 *   E     viewer         NULL            4xx TENANT_REQUIRED (fail-closed)
 *   F     super_admin    NULL            4xx TENANT_REQUIRED  ←  FINDING-HFRLS06B-F1
 *   G     super_admin    tenant real     200 (fluxo legítimo intacto)
 *
 * Nota HF-RLS-06C: após revogação do grant EXECUTE de PUBLIC/anon, os casos
 * A e B são bloqueados no nível de grant (Postgres 42501) antes mesmo de
 * atingir a whitelist interna da função. Isso é defense-in-depth — o
 * comportamento observável (4xx sem dados) permanece o mesmo.
 *
 * FINDING-HFRLS06B-F1 (P2, informacional): a implementação atual exige
 * p_tenant_id explícito para TODOS os chamadores (inclusive super_admin).
 * Isso é seguro (fail-closed) porém stricter do que o desenho do relatório
 * inicial. Deve ser tratado como nota — não é regressão do fluxo legítimo:
 * super_admin continua funcionando ao informar tenant, que é o caminho
 * usado pela UI real.
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
        expect([400, 401, 403]).toContain(r.status);
        expect(r.text).toMatch(/TENANT_REQUIRED|TENANT_FORBIDDEN|not authoriz|permission denied/i);
        expect(r.text).not.toContain('"agent_id"');
      });

      test(`Caso B — anon + tenant explícito bloqueado`, async () => {
        const r = await callRpc(rpc, { p_tenant_id: TENANT_A }, null);
        expect([400, 401, 403]).toContain(r.status);
        expect(r.text).toMatch(/TENANT_FORBIDDEN|role anon|not authoriz|permission denied/i);
        expect(r.text).not.toContain('"agent_id"');
      });


      test(`Caso C — viewer + own tenant retorna 200`, async () => {
        const token = await signIn(VIEWER.email, VIEWER.password);
        test.skip(!token, "viewer seed missing");
        const r = await callRpc(rpc, { p_tenant_id: TENANT_A }, token);
        expect(r.status, `body=${r.text}`).toBe(200);
      });

      test(`Caso D — viewer + tenant estrangeiro rejeitado`, async () => {
        const token = await signIn(VIEWER.email, VIEWER.password);
        test.skip(!token, "viewer seed missing");
        const r = await callRpc(rpc, { p_tenant_id: FOREIGN_TENANT }, token);
        expect([400, 403]).toContain(r.status);
        expect(r.text).toMatch(/TENANT_MISMATCH|TENANT_FORBIDDEN|forbidden|permission/i);
        expect(r.text).not.toContain('"agent_id"');
      });

      test(`Caso E — viewer + tenant NULL rejeitado (fail-closed)`, async () => {
        const token = await signIn(VIEWER.email, VIEWER.password);
        test.skip(!token, "viewer seed missing");
        const r = await callRpc(rpc, { p_tenant_id: null }, token);
        expect([400, 401, 403]).toContain(r.status);
        expect(r.text).toMatch(/TENANT_REQUIRED/i);
      });

      test(`Caso F — super_admin + tenant NULL rejeitado (fail-closed, ver FINDING-HFRLS06B-F1)`, async () => {
        const token = await signIn(SUPER_ADMIN.email, SUPER_ADMIN.password);
        test.skip(!token, "super_admin seed missing");
        const r = await callRpc(rpc, { p_tenant_id: null }, token);
        // Comportamento atual: exigido tenant explícito mesmo para super_admin.
        // Documentado como stricter-than-spec; NÃO é vazamento.
        expect([400, 401, 403]).toContain(r.status);
        expect(r.text).toMatch(/TENANT_REQUIRED/i);
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
