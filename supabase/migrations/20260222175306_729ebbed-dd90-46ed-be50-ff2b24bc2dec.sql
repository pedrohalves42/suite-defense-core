
-- V-001 FIX: Migrate ALL 145 policies from role {public} to {authenticated}
-- This prevents any theoretical unauthenticated access via the public role.
-- Also V-002 FIX: Add tenant-scoped SELECT for 5 automation tables.

DO $$
DECLARE
  rec RECORD;
BEGIN
  FOR rec IN
    SELECT pol.tablename, pol.policyname
    FROM pg_policies pol
    WHERE pol.schemaname = 'public'
      AND pol.roles = '{public}'
    ORDER BY pol.tablename
  LOOP
    EXECUTE format(
      'ALTER POLICY %I ON public.%I TO authenticated',
      rec.policyname,
      rec.tablename
    );
    RAISE NOTICE 'Migrated policy % on % to authenticated', rec.policyname, rec.tablename;
  END LOOP;
END;
$$;

-- V-002 FIX: Add tenant-scoped SELECT policies for automation tables
-- These were service_role-only, causing silent empty results in UI

CREATE POLICY "automation_approvals_select_tenant"
ON public.automation_approvals
FOR SELECT TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "automation_decision_log_select_tenant"
ON public.automation_decision_log
FOR SELECT TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "automation_execution_log_select_tenant"
ON public.automation_execution_log
FOR SELECT TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "automation_rule_versions_select_tenant"
ON public.automation_rule_versions
FOR SELECT TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

CREATE POLICY "automation_sla_metrics_select_tenant"
ON public.automation_sla_metrics
FOR SELECT TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());
