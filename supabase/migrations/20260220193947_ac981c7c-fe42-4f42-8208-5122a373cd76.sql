
-- =============================================
-- ADR-037: Security Hardening - Views & RLS
-- =============================================

-- 1. FIX CRITICAL: ai_response_cache has ALL for public role
DROP POLICY IF EXISTS "Service role full access on ai_response_cache" ON public.ai_response_cache;
CREATE POLICY "Only service role can manage ai_response_cache"
  ON public.ai_response_cache FOR ALL
  TO service_role
  USING (true)
  WITH CHECK (true);

-- Allow authenticated users to SELECT from cache (tenant_id is TEXT here)
CREATE POLICY "Authenticated users can read ai_response_cache"
  ON public.ai_response_cache FOR SELECT
  TO authenticated
  USING (tenant_id = get_active_tenant_id()::text OR is_current_super_admin());

-- 2. Harden agents_safe view with security_barrier
ALTER VIEW public.agents_safe SET (security_barrier = true);

COMMENT ON VIEW public.agents_safe IS 
  'ADR-037: Intentionally uses security_invoker=off for dashboard compatibility. '
  'Tenant isolation enforced internally via get_active_tenant_id() filter. '
  'security_barrier=true prevents query optimization leaks.';

-- 3. Harden failure_fingerprints and incident_slo_state if they have tenant_id
DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'failure_fingerprints' AND column_name = 'tenant_id'
  ) THEN
    DROP POLICY IF EXISTS "authenticated_read_fingerprints" ON public.failure_fingerprints;
    EXECUTE 'CREATE POLICY "authenticated_read_fingerprints" ON public.failure_fingerprints FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())';
  END IF;
END $$;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM information_schema.columns 
    WHERE table_name = 'incident_slo_state' AND column_name = 'tenant_id'
  ) THEN
    DROP POLICY IF EXISTS "authenticated_read_incident_slo" ON public.incident_slo_state;
    EXECUTE 'CREATE POLICY "authenticated_read_incident_slo" ON public.incident_slo_state FOR SELECT TO authenticated USING (tenant_id = get_active_tenant_id() OR is_current_super_admin())';
  END IF;
END $$;
