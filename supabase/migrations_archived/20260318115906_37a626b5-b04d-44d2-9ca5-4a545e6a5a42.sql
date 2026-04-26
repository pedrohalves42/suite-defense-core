
-- FIX 1: Remove conflicting rate_limits policy
DROP POLICY IF EXISTS "rate_limits_select_authenticated" ON public.rate_limits;

-- FIX 2: Scope agent_updates admin policy to active tenant
DROP POLICY IF EXISTS "Admins can manage agent updates" ON public.agent_updates;
CREATE POLICY "Admins can manage agent updates"
  ON public.agent_updates
  FOR ALL
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    AND tenant_id = get_active_tenant_id()
  )
  WITH CHECK (
    has_role(auth.uid(), 'admin'::app_role)
    AND tenant_id = get_active_tenant_id()
  );

-- FIX 3: Restrict update_packages to super_admin only
DROP POLICY IF EXISTS "Admins can manage packages" ON public.update_packages;
CREATE POLICY "Super admins can manage packages"
  ON public.update_packages
  FOR ALL
  TO authenticated
  USING (has_role(auth.uid(), 'super_admin'::app_role))
  WITH CHECK (has_role(auth.uid(), 'super_admin'::app_role));

-- FIX 4: Harden get_active_tenant_id - remove unsafe fallback
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
RETURNS uuid
LANGUAGE plpgsql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_claim text;
BEGIN
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  
  IF v_claim IS NOT NULL AND v_claim != '' THEN
    RETURN v_claim::uuid;
  END IF;

  RETURN NULL;
END;
$$;

-- FIX 5: threat_network_reputation is global shared data (no tenant_id column)
-- Restrict to service_role only, remove direct authenticated access
DROP POLICY IF EXISTS "authenticated_threat_reputation_select" ON public.threat_network_reputation;
-- Keep only the service_role policy which already exists

-- FIX 6: Restrict agent_releases SELECT to admins only
DROP POLICY IF EXISTS "agent_releases_select_active_or_admin" ON public.agent_releases;
CREATE POLICY "agent_releases_select_admin_only"
  ON public.agent_releases
  FOR SELECT
  TO authenticated
  USING (
    has_role(auth.uid(), 'admin'::app_role)
    OR has_role(auth.uid(), 'super_admin'::app_role)
  );

-- FIX 7: Add security_barrier to v_job_metrics_by_type
ALTER VIEW public.v_job_metrics_by_type SET (security_barrier = true);

-- FIX 8: Set search_path on enforce_job_side_effects
ALTER FUNCTION public.enforce_job_side_effects() SET search_path = public;
