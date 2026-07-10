/**
 * admin-seed-synthetic-tenants
 *
 * One-shot idempotent seed of two synthetic tenants + users used by the
 * P0-01 cross-tenant RLS spec (tests/security/cross-tenant-rls.spec.ts).
 *
 * Guardrails (hardened per Sprint 1 review):
 *   - Protected by header X-Seed-Token (must equal SEED_ADMIN_TOKEN secret).
 *   - Refuses to execute unless ALLOW_SYNTHETIC_SEED === "true" — prevents
 *     accidental invocation in production.
 *   - Uses service_role internally.
 *   - Idempotent: existing auth users, tenants, and role bindings are reused;
 *     never recreated.
 *   - Passwords are supplied by the caller in the request body (Opção A).
 *     They are NEVER echoed back in the response and NEVER logged.
 *   - Emails/slugs are stable and namespaced under `sprint1-*`.
 *   - Writes an audit_logs row (action=synthetic_seed) with executor IP,
 *     timestamp, and a summary of what was created vs. reused.
 *
 * Not runtime: this function has no callers from the app. It exists solely
 * to seed the isolated test-only tenants required to close P0-01.
 */
import { createClient } from "npm:@supabase/supabase-js@2";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers":
    "authorization, x-client-info, apikey, content-type, x-seed-token",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const json = (status: number, body: unknown) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { ...corsHeaders, "Content-Type": "application/json" },
  });

type SeedSpec = {
  key: "tenantA" | "tenantB";
  slug: string;
  name: string;
  email: string;
};

const SEED: readonly SeedSpec[] = [
  {
    key: "tenantA",
    slug: "sprint1-tenant-a",
    name: "Sprint1 Tenant A (synthetic)",
    email: "sprint1-a@synthetic.local",
  },
  {
    key: "tenantB",
    slug: "sprint1-tenant-b",
    name: "Sprint1 Tenant B (synthetic)",
    email: "sprint1-b@synthetic.local",
  },
] as const;

function isValidPassword(p: unknown): p is string {
  return typeof p === "string" && p.length >= 16 && p.length <= 256;
}

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  // Environment guard — must be explicitly enabled.
  if (Deno.env.get("ALLOW_SYNTHETIC_SEED") !== "true") {
    return json(403, {
      error: "synthetic_seed_disabled",
      hint: "Set ALLOW_SYNTHETIC_SEED=true in the function environment to enable this seed. Never enable in production.",
    });
  }

  // Auth guard — accept EITHER of:
  //   (a) X-Seed-Token header matching SEED_ADMIN_TOKEN secret (operator/CI path)
  //   (b) A Bearer JWT belonging to a super_admin user (agent/preview path)
  const svcClient = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );
  const expected = Deno.env.get("SEED_ADMIN_TOKEN");
  const provided = req.headers.get("x-seed-token");
  let authorized = !!(expected && provided && provided === expected);
  if (!authorized) {
    const authz = req.headers.get("authorization") ?? "";
    const bearer = authz.toLowerCase().startsWith("bearer ") ? authz.slice(7) : null;
    if (bearer) {
      const { data: userData } = await svcClient.auth.getUser(bearer);
      if (userData?.user) {
        const { data: role } = await svcClient
          .from("user_roles")
          .select("id")
          .eq("user_id", userData.user.id)
          .eq("role", "super_admin")
          .maybeSingle();
        if (role) authorized = true;
      }
    }
  }
  if (!authorized) return json(401, { error: "unauthorized" });

  // Body — passwords may come from the caller OR from SPRINT1_TENANT_*_PASSWORD
  // secrets. Never echoed back, never logged.
  let body: Record<string, unknown> = {};
  try { body = await req.json(); } catch { body = {}; }
  const tenantAPassword = body.tenantAPassword ?? Deno.env.get("SPRINT1_TENANT_A_PASSWORD");
  const tenantBPassword = body.tenantBPassword ?? Deno.env.get("SPRINT1_TENANT_B_PASSWORD");
  if (!isValidPassword(tenantAPassword) || !isValidPassword(tenantBPassword)) {
    return json(400, {
      error: "invalid_passwords",
      hint: "Provide tenantAPassword/tenantBPassword in body OR set SPRINT1_TENANT_A_PASSWORD / SPRINT1_TENANT_B_PASSWORD secrets (16..256 chars).",
    });
  }
  const passwords: Record<SeedSpec["key"], string> = {
    tenantA: tenantAPassword as string,
    tenantB: tenantBPassword as string,
  };

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const audit: Array<Record<string, unknown>> = [];
  const results: Record<string, { id: string; user_id: string; email: string; created: { user: boolean; tenant: boolean; role: boolean } }> = {} as never;

  for (const spec of SEED) {
    const password = passwords[spec.key];
    let userCreated = false;
    let tenantCreated = false;
    let roleCreated = false;

    // 1. Auth user (idempotent — reuse if exists; do NOT reset password)
    let userId: string | null = null;
    const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
    const existingUser = list?.users.find((u) => u.email === spec.email);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { data: created, error: createErr } = await supabase.auth.admin.createUser({
        email: spec.email,
        password,
        email_confirm: true,
        app_metadata: { synthetic: true, sprint: 1 },
      });
      if (createErr || !created?.user) {
        return json(500, { step: "auth", key: spec.key, error: createErr?.message ?? "create_failed" });
      }
      userId = created.user.id;
      userCreated = true;
    }

    // 2. Tenant (idempotent by slug)
    let tenantId: string | null = null;
    const { data: existingTenant } = await supabase
      .from("tenants")
      .select("id")
      .eq("slug", spec.slug)
      .maybeSingle();
    if (existingTenant) {
      tenantId = existingTenant.id;
    } else {
      const { data: newTenant, error: tErr } = await supabase
        .from("tenants")
        .insert({ slug: spec.slug, name: spec.name, owner_user_id: userId })
        .select("id")
        .single();
      if (tErr || !newTenant) {
        return json(500, { step: "tenant", key: spec.key, error: tErr?.message ?? "insert_failed" });
      }
      tenantId = newTenant.id;
      tenantCreated = true;
    }

    // 3. Role binding (idempotent)
    const { data: existingRole } = await supabase
      .from("user_roles")
      .select("id")
      .eq("user_id", userId)
      .eq("tenant_id", tenantId)
      .eq("role", "admin")
      .maybeSingle();
    if (!existingRole) {
      const { error: rErr } = await supabase
        .from("user_roles")
        .insert({ user_id: userId, tenant_id: tenantId, role: "admin" });
      if (rErr) return json(500, { step: "user_roles", key: spec.key, error: rErr.message });
      roleCreated = true;
    }

    // 4. Minimal seed row so the probe distinguishes
    //    "0 because RLS filtered" from "0 because empty".
    await supabase.from("system_alerts").insert({
      tenant_id: tenantId,
      alert_type: "synthetic_seed",
      severity: "info",
      title: `Synthetic seed for ${spec.slug}`,
      message: "Row inserted by admin-seed-synthetic-tenants for P0-01 probe.",
      source: "seed",
    });

    results[spec.key] = {
      id: tenantId,
      user_id: userId,
      email: spec.email,
      created: { user: userCreated, tenant: tenantCreated, role: roleCreated },
    };
    audit.push({
      key: spec.key,
      slug: spec.slug,
      tenant_id: tenantId,
      user_id: userId,
      created: { user: userCreated, tenant: tenantCreated, role: roleCreated },
    });
  }

  // Audit log — executor + timestamp + summary. Passwords are NEVER logged.
  const executorIp =
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ??
    req.headers.get("x-real-ip") ??
    "unknown";
  await supabase.from("audit_logs").insert({
    action: "synthetic_seed",
    resource_type: "tenants",
    ip_address: executorIp,
    user_agent: req.headers.get("user-agent") ?? null,
    metadata: {
      function: "admin-seed-synthetic-tenants",
      sprint: 1,
      p0_item: "P0-01",
      results: audit,
      generated_at: new Date().toISOString(),
    },
  });

  return json(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    note: "Populate .env.test with TEST_TENANT_A_* / TEST_TENANT_B_* using the ids/emails below. Passwords are the ones you supplied in the request body — they are not echoed here by design.",
    tenantA: { id: results.tenantA.id, email: results.tenantA.email, created: results.tenantA.created },
    tenantB: { id: results.tenantB.id, email: results.tenantB.email, created: results.tenantB.created },
  });
});
