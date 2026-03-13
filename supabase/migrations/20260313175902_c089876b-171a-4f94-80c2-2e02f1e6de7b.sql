
-- ============================================================
-- SECURITY SCAN REMEDIATION: Fix 6 RLS policy vulnerabilities
-- ============================================================

-- V-SEC-004: failure_fingerprints - Global table, restrict to super_admins
DROP POLICY IF EXISTS "authenticated_read_fingerprints" ON public.failure_fingerprints;
CREATE POLICY "super_admin_read_fingerprints"
ON public.failure_fingerprints
FOR SELECT
TO authenticated
USING (is_current_super_admin());

-- V-SEC-005: incident_slo_state - Global table, restrict to super_admins
DROP POLICY IF EXISTS "authenticated_read_incident_slo" ON public.incident_slo_state;
CREATE POLICY "super_admin_read_incident_slo"
ON public.incident_slo_state
FOR SELECT
TO authenticated
USING (is_current_super_admin());

-- V-SEC-006: system_health_checks - Restrict to super_admins only (exposes SQL)
DROP POLICY IF EXISTS "Authenticated users can view health checks" ON public.system_health_checks;
DROP POLICY IF EXISTS "admin_only_system_health_checks" ON public.system_health_checks;
CREATE POLICY "super_admin_only_health_checks"
ON public.system_health_checks
FOR SELECT
TO authenticated
USING (is_current_super_admin());
