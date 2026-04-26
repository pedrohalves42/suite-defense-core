-- =============================================================================
-- ADR-024: RLS Hardening Phase 2 - Fix Remaining Permissive Policies
-- =============================================================================
-- Fixes 11 existing tables with overly permissive SELECT policies.
-- Tables compliance_frameworks, compliance_controls, cve_keyword_cache, 
-- ai_insight_patterns, api_rate_limits do not exist - skipping.
-- =============================================================================

-- -----------------------------------------------------------------------------
-- 1. software_vulnerability_baseline - restrict to admin/super_admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view baseline" ON public.software_vulnerability_baseline;
DROP POLICY IF EXISTS "select_all" ON public.software_vulnerability_baseline;

CREATE POLICY "admin_only_select_vulnerability_baseline" 
ON public.software_vulnerability_baseline
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);

-- -----------------------------------------------------------------------------
-- 2. cve_database - restrict to admin/super_admin (contains CVE details)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read CVE data" ON public.cve_database;
DROP POLICY IF EXISTS "select_all" ON public.cve_database;

CREATE POLICY "admin_only_select_cve_database" 
ON public.cve_database
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);

-- -----------------------------------------------------------------------------
-- 3. software_knowledge_base - restrict to admin/super_admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Authenticated users can view software knowledge" ON public.software_knowledge_base;
DROP POLICY IF EXISTS "select_all" ON public.software_knowledge_base;

CREATE POLICY "admin_only_select_software_knowledge" 
ON public.software_knowledge_base
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);

-- -----------------------------------------------------------------------------
-- 4. agent_releases - restrict to authenticated (was public)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Public can read active releases" ON public.agent_releases;
DROP POLICY IF EXISTS "agent_releases_public_read" ON public.agent_releases;

CREATE POLICY "authenticated_select_agent_releases" 
ON public.agent_releases
FOR SELECT TO authenticated
USING (is_active = true);

-- -----------------------------------------------------------------------------
-- 5. agent_versions - restrict to admin/super_admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Agents can read versions" ON public.agent_versions;
DROP POLICY IF EXISTS "agents_can_read_versions" ON public.agent_versions;

CREATE POLICY "admin_only_agent_versions" 
ON public.agent_versions
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);

-- -----------------------------------------------------------------------------
-- 6. system_state - restrict to super_admin only (critical system table)
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read system state" ON public.system_state;
DROP POLICY IF EXISTS "select_all" ON public.system_state;

CREATE POLICY "super_admin_only_system_state" 
ON public.system_state
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- -----------------------------------------------------------------------------
-- 7. system_liveness - restrict to admin/super_admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read liveness" ON public.system_liveness;
DROP POLICY IF EXISTS "select_all" ON public.system_liveness;

CREATE POLICY "admin_only_system_liveness" 
ON public.system_liveness
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);

-- -----------------------------------------------------------------------------
-- 8. system_health_checks - restrict to admin/super_admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read health checks" ON public.system_health_checks;
DROP POLICY IF EXISTS "select_all" ON public.system_health_checks;

CREATE POLICY "admin_only_system_health_checks" 
ON public.system_health_checks
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);

-- -----------------------------------------------------------------------------
-- 9. runbooks - restrict to admin/operator/super_admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read runbooks" ON public.runbooks;
DROP POLICY IF EXISTS "select_all" ON public.runbooks;

CREATE POLICY "operator_admin_select_runbooks" 
ON public.runbooks
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'operator')
  OR public.has_role(auth.uid(), 'super_admin')
);

-- -----------------------------------------------------------------------------
-- 10. security_definer_allowlist - restrict to super_admin only
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read allowlist" ON public.security_definer_allowlist;
DROP POLICY IF EXISTS "select_all" ON public.security_definer_allowlist;

CREATE POLICY "super_admin_only_security_definer_allowlist" 
ON public.security_definer_allowlist
FOR SELECT TO authenticated
USING (public.has_role(auth.uid(), 'super_admin'));

-- -----------------------------------------------------------------------------
-- 11. feature_flags - restrict to admin/super_admin
-- -----------------------------------------------------------------------------
DROP POLICY IF EXISTS "Anyone can read feature flags" ON public.feature_flags;
DROP POLICY IF EXISTS "select_all" ON public.feature_flags;

CREATE POLICY "admin_only_feature_flags" 
ON public.feature_flags
FOR SELECT TO authenticated
USING (
  public.has_role(auth.uid(), 'admin') 
  OR public.has_role(auth.uid(), 'super_admin')
);