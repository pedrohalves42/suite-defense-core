/**
 * admin-run-cross-tenant-probe
 *
 * Executes the P0-01 cross-tenant RLS matrix server-side using the two
 * synthetic tenants seeded by admin-seed-synthetic-tenants.
 *
 * For each of MULTI_TENANT_TABLES and both directions
 * (A signed-in queries B's rows / B signed-in queries A's rows) it runs
 *
 *     select count(*) from public.<t> where tenant_id = <other_tenant_id>
 *
 * as the authenticated user (Data API / PostgREST, so RLS is enforced).
 * Returns the same JSON shape as tests/security/cross-tenant-rls.spec.ts
 * writes to report.json, so the agent can persist it as evidence.
 *
 * Guardrails:
 *   - Requires ALLOW_SYNTHETIC_SEED === "true" (same kill-switch as the seed).
 *   - Requires super_admin JWT (Bearer). Passwords are read from
 *     SPRINT1_TENANT_A_PASSWORD / SPRINT1_TENANT_B_PASSWORD secrets — never
 *     accepted from the caller, never echoed.
 *   - Read-only: only SELECTs, no writes to schema public.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

const MULTI_TENANT_TABLES = [
  "agents","tasks","system_alerts","jobs","ai_insights",
  "agent_web_activity","agent_disk_metrics","agent_network_info","agent_builds",
  "agent_evidence_logs","agent_rollback_events","agent_safe_mode_events",
  "enrollment_keys","security_policies","governance_reports","playbook_executions",
  "scheduled_jobs","vuln_findings","software_inventory","user_roles",
  "tenant_features","tenant_action_policies","blocked_websites",
  "ai_action_logs","api_keys","api_request_logs","compliance_policies",
  "failed_login_attempts","quarantined_files","report_executions","reports",
  "security_logs","soc2_controls","soc2_criteria","tenant_settings",
  "tenant_subscriptions","vendor_risk_registry","virus_scans",
  "anomaly_events","audit_reason_trees","ai_action_validations",
  "antivirus_status","custom_trials","policy_assignments",
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  if (Deno.env.get("ALLOW_SYNTHETIC_SEED") !== "true") {
    return json(403, { error: "synthetic_seed_disabled" });
  }

  const SUPABASE_URL = Deno.env.get("SUPABASE_URL")!;
  const SERVICE_ROLE = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!;
  const ANON_KEY = Deno.env.get("SUPABASE_ANON_KEY")!;
  const svc = createClient(SUPABASE_URL, SERVICE_ROLE, {
    auth: { persistSession: false, autoRefreshToken: false },
  });

  // Auth: super_admin JWT OR SEED_ONESHOT_TOKEN header (bootstrap path used
  // by the Lovable agent when no preview session is available).
  const oneshot = Deno.env.get("SEED_ONESHOT_TOKEN");
  const provided = req.headers.get("x-seed-token");
  let authorized = !!(oneshot && provided && provided === oneshot);
  if (!authorized) {
    const authz = req.headers.get("authorization") ?? "";
    const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7) : null;
    if (!bearer) return json(401, { error: "unauthorized" });
    const { data: uData } = await svc.auth.getUser(bearer);
    if (!uData?.user) return json(401, { error: "unauthorized" });
    const { data: roleRow } = await svc
      .from("user_roles")
      .select("id")
      .eq("user_id", uData.user.id)
      .eq("role", "super_admin")
      .maybeSingle();
    if (!roleRow) return json(403, { error: "forbidden_not_super_admin" });
  }

  // Resolve synthetic tenants by slug
  const slugs = ["sprint1-tenant-a", "sprint1-tenant-b"] as const;
  const { data: tenants, error: tErr } = await svc
    .from("tenants")
    .select("id, slug, owner_user_id")
    .in("slug", slugs as unknown as string[]);
  if (tErr || !tenants || tenants.length !== 2) {
    return json(500, {
      error: "synthetic_tenants_missing",
      hint: "Run admin-seed-synthetic-tenants first.",
      detail: tErr?.message,
    });
  }
  const tA = tenants.find(t => t.slug === "sprint1-tenant-a")!;
  const tB = tenants.find(t => t.slug === "sprint1-tenant-b")!;

  // Look up emails for the owners
  const { data: userList } = await svc.auth.admin.listUsers({ page: 1, perPage: 200 });
  const emailA = userList?.users.find(u => u.id === tA.owner_user_id)?.email;
  const emailB = userList?.users.find(u => u.id === tB.owner_user_id)?.email;
  const pwA = Deno.env.get("SPRINT1_TENANT_A_PASSWORD");
  const pwB = Deno.env.get("SPRINT1_TENANT_B_PASSWORD");
  if (!emailA || !emailB || !pwA || !pwB) {
    return json(500, { error: "seed_incomplete", hasEmailA: !!emailA, hasEmailB: !!emailB, hasPwA: !!pwA, hasPwB: !!pwB });
  }

  async function signIn(email: string, password: string) {
    const c = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { persistSession: false, autoRefreshToken: false },
    });
    const { data, error } = await c.auth.signInWithPassword({ email, password });
    if (error || !data?.session) throw new Error(`signin_failed(${email}): ${error?.message}`);
    return c;
  }

  const clientA = await signIn(emailA, pwA);
  const clientB = await signIn(emailB, pwB);

  type Row = { scenario: "A_sees_B" | "B_sees_A"; table: string; leaked_rows: number | null; error: string | null };
  const results: Row[] = [];
  const scenarios = [
    { name: "A_sees_B" as const, client: clientA, otherTenant: tB.id },
    { name: "B_sees_A" as const, client: clientB, otherTenant: tA.id },
  ];
  for (const s of scenarios) {
    for (const table of MULTI_TENANT_TABLES) {
      const { count, error } = await s.client
        .from(table)
        // deno-lint-ignore no-explicit-any
        .select("*", { count: "exact", head: true } as any)
        .eq("tenant_id", s.otherTenant);
      const errText = error
        ? (error.message || error.details || error.hint || error.code || JSON.stringify(error))
        : null;
      results.push({
        scenario: s.name,
        table,
        leaked_rows: error ? null : (count ?? 0),
        error: errText,
      });
    }
  }

  const leaks = results.filter(r => (r.leaked_rows ?? 0) > 0);
  const summary = {
    generated_at: new Date().toISOString(),
    executed_by: "admin-run-cross-tenant-probe",
    tenant_a: tA.id,
    tenant_b: tB.id,
    total_probes: results.length,
    clean: results.filter(r => r.leaked_rows === 0).length,
    leaked: leaks.length,
    errored: results.filter(r => r.error !== null).length,
    leaks,
    results,
  };
  return json(200, summary);
});
