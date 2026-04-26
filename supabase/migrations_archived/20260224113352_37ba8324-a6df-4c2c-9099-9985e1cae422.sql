
-- V-205 TIER 3: Fix ip_blocklist + rls_test_results

-- ============================================================
-- 1. ip_blocklist: Add tenant_id for per-tenant IP blocking
-- ============================================================
ALTER TABLE public.ip_blocklist ADD COLUMN IF NOT EXISTS tenant_id uuid REFERENCES public.tenants(id);
CREATE INDEX IF NOT EXISTS idx_ip_blocklist_tenant_id ON public.ip_blocklist(tenant_id);

-- Update RLS: tenant-scoped blocking
DROP POLICY IF EXISTS "Super admins can view ip blocklist" ON public.ip_blocklist;
CREATE POLICY "ip_blocklist_select_tenant_direct"
ON public.ip_blocklist FOR SELECT TO authenticated
USING (
  (tenant_id = get_active_tenant_id()) OR (tenant_id IS NULL) OR is_current_super_admin()
);

DROP POLICY IF EXISTS "Super admins can unblock IPs_v206" ON public.ip_blocklist;
CREATE POLICY "ip_blocklist_delete_tenant_direct"
ON public.ip_blocklist FOR DELETE TO authenticated
USING (
  (has_role(auth.uid(), 'admin') AND tenant_id = get_active_tenant_id())
  OR is_current_super_admin()
);

-- ============================================================
-- 2. rls_test_results: Add TTL with 30-day retention
-- ============================================================
CREATE OR REPLACE FUNCTION public.cleanup_rls_test_results()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  DELETE FROM public.rls_test_results
  WHERE tested_at < now() - interval '30 days';
END;
$$;

-- Clean existing old data now
DELETE FROM public.rls_test_results
WHERE tested_at < now() - interval '30 days';

COMMENT ON TABLE public.ip_blocklist IS 'Per-tenant IP blocking. tenant_id NULL = global block (system-level).';
COMMENT ON TABLE public.rls_test_results IS 'RLS test results with 30-day TTL. Cleaned by cleanup_rls_test_results().';
