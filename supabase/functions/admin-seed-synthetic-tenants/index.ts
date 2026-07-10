/**
 * admin-seed-synthetic-tenants
 *
 * One-shot idempotent seed of two synthetic tenants + users used by the
 * P0-01 cross-tenant RLS spec (tests/security/cross-tenant-rls.spec.ts).
 *
 * Guardrails:
 *   - Protected by header X-Seed-Token (must equal SEED_ADMIN_TOKEN secret).
 *   - Uses service_role internally.
 *   - Idempotent: safe to call repeatedly; existing rows are reused.
 *   - Emails/slugs are stable and namespaced under `sprint1-*`.
 *   - Passwords come from SPRINT1_TENANT_A_PASSWORD / _B_PASSWORD secrets;
 *     they are echoed in the response only so the caller can populate
 *     .env.test — do not log them.
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

const SEED = [
  {
    key: "tenantA",
    slug: "sprint1-tenant-a",
    name: "Sprint1 Tenant A (synthetic)",
    email: "sprint1-a@synthetic.local",
    passwordEnv: "SPRINT1_TENANT_A_PASSWORD",
  },
  {
    key: "tenantB",
    slug: "sprint1-tenant-b",
    name: "Sprint1 Tenant B (synthetic)",
    email: "sprint1-b@synthetic.local",
    passwordEnv: "SPRINT1_TENANT_B_PASSWORD",
  },
] as const;

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response("ok", { headers: corsHeaders });
  if (req.method !== "POST") return json(405, { error: "method_not_allowed" });

  const expected = Deno.env.get("SEED_ADMIN_TOKEN");
  const provided = req.headers.get("x-seed-token");
  if (!expected || !provided || provided !== expected) {
    return json(401, { error: "unauthorized" });
  }

  const supabase = createClient(
    Deno.env.get("SUPABASE_URL")!,
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
    { auth: { persistSession: false, autoRefreshToken: false } },
  );

  const results: Record<string, unknown> = {};

  for (const spec of SEED) {
    const password = Deno.env.get(spec.passwordEnv);
    if (!password) return json(500, { error: `missing_secret:${spec.passwordEnv}` });

    // 1. Auth user (idempotent — reuse if exists)
    let userId: string | null = null;
    const { data: created, error: createErr } = await supabase.auth.admin.createUser({
      email: spec.email,
      password,
      email_confirm: true,
      app_metadata: { synthetic: true, sprint: 1 },
    });
    if (createErr) {
      // Already exists → look up
      const { data: list } = await supabase.auth.admin.listUsers({ page: 1, perPage: 200 });
      const found = list?.users.find((u) => u.email === spec.email);
      if (!found) return json(500, { step: "auth", error: createErr.message });
      userId = found.id;
      // Force password to match current secret
      await supabase.auth.admin.updateUserById(found.id, { password });
    } else {
      userId = created.user!.id;
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
      if (tErr) return json(500, { step: "tenant", error: tErr.message });
      tenantId = newTenant.id;
    }

    // 3. Role binding (unique on tenant_id+user_id)
    const { error: rErr } = await supabase
      .from("user_roles")
      .upsert(
        { user_id: userId, tenant_id: tenantId, role: "admin" },
        { onConflict: "tenant_id,user_id" },
      );
    if (rErr) return json(500, { step: "user_roles", error: rErr.message });

    // 4. Minimal seed row so the probe distinguishes
    //    "0 because RLS filtered" from "0 because empty".
    //    Insert one system_alert (schema tolerant, minimal columns).
    await supabase.from("system_alerts").insert({
      tenant_id: tenantId,
      alert_type: "synthetic_seed",
      severity: "info",
      title: `Synthetic seed for ${spec.slug}`,
      message: "Row inserted by admin-seed-synthetic-tenants for P0-01 probe.",
      source: "seed",
    });

    results[spec.key] = { id: tenantId, user_id: userId, email: spec.email, password };
  }

  return json(200, {
    ok: true,
    generated_at: new Date().toISOString(),
    note: "Populate .env.test with TEST_TENANT_A_* / TEST_TENANT_B_* using this response, then run scripts/security/test-cross-tenant-isolation.ts.",
    ...results,
  });
});
