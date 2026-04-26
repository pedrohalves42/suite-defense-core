-- =============================================================================
-- PHASE A+B: Views com get_active_tenant_id() + RLS Hardening
-- ADR-026 Final Closure - 36 views + 6 tabelas
-- FIXED: jobs columns, agents columns
-- =============================================================================

-- DROP views que foram dropadas antes (precisam ser recriadas)
DROP VIEW IF EXISTS public.v_agent_lifecycle_state CASCADE;

-- 18. v_agent_lifecycle_state (FIXED: force_update_at instead of force_update_requested_at)
CREATE VIEW public.v_agent_lifecycle_state
WITH (security_invoker = on) AS
SELECT id AS agent_id, tenant_id, agent_name, agent_state, agent_state_reason, agent_state_changed_at,
    is_isolated, isolation_reason, isolated_at, requires_revalidation, revalidation_reason, revalidation_required_at,
    safe_mode_entered_at, safe_mode_reason, force_update_version, force_update_reason, force_update_at,
    last_heartbeat, status, agent_version
FROM agents
WHERE (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- =====================================================
-- PARTE 3: RLS HARDENING NAS 6 TABELAS EXPOSTAS
-- =====================================================

-- invites: restringir SELECT a authenticated com tenant filter
DROP POLICY IF EXISTS "authenticated_select_invites" ON public.invites;
DROP POLICY IF EXISTS "public_select_invites" ON public.invites;
CREATE POLICY "authenticated_select_invites" ON public.invites
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- agent_tokens: REVOKE all from anon/authenticated (service_role only)
REVOKE ALL ON public.agent_tokens FROM anon, authenticated;

-- jobs: restringir SELECT a tenant ativo
DROP POLICY IF EXISTS "authenticated_select_jobs" ON public.jobs;
DROP POLICY IF EXISTS "Users can view jobs from their tenant" ON public.jobs;
CREATE POLICY "authenticated_select_jobs" ON public.jobs
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- agents: garantir RLS com tenant ativo (hmac_secret ja protegido via views)
DROP POLICY IF EXISTS "authenticated_select_agents" ON public.agents;
DROP POLICY IF EXISTS "Users can view agents from their tenant" ON public.agents;
CREATE POLICY "authenticated_select_agents" ON public.agents
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- profiles: restringir a proprio usuario OU super admin
DROP POLICY IF EXISTS "authenticated_select_profiles" ON public.profiles;
DROP POLICY IF EXISTS "Users can view own profile" ON public.profiles;
CREATE POLICY "authenticated_select_profiles" ON public.profiles
  FOR SELECT TO authenticated
  USING (user_id = auth.uid() OR public.is_current_super_admin());

-- vuln_findings: restringir a tenant ativo
DROP POLICY IF EXISTS "authenticated_select_vuln_findings" ON public.vuln_findings;
DROP POLICY IF EXISTS "Users can view vuln_findings from their tenant" ON public.vuln_findings;
CREATE POLICY "authenticated_select_vuln_findings" ON public.vuln_findings
  FOR SELECT TO authenticated
  USING (tenant_id = public.get_active_tenant_id() OR public.is_current_super_admin());

-- Garantir que anon nao tem acesso as tabelas sensiveis
REVOKE ALL ON public.invites FROM anon;
REVOKE ALL ON public.jobs FROM anon;
REVOKE ALL ON public.agents FROM anon;
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.vuln_findings FROM anon;