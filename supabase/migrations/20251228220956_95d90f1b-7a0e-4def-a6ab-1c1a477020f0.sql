
-- =========================================================================
-- MIGRACAO DEFINITIVA: Substituir TODAS as politicas que usam current_user_tenant_id()
-- Solucao: usar tenant_id IN (SELECT tenant_id FROM user_roles WHERE user_id = auth.uid())
-- =========================================================================

-- Helper function to check if user belongs to a tenant
CREATE OR REPLACE FUNCTION public.user_has_tenant_access(_tenant_id uuid)
RETURNS boolean
LANGUAGE sql
SECURITY DEFINER
STABLE
SET search_path = public
AS $$
  SELECT EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = auth.uid() 
    AND tenant_id = _tenant_id
  );
$$;

-- =========================================================================
-- 1. agents - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can manage agents in their tenant" ON public.agents;
DROP POLICY IF EXISTS "Operators can view agents in their tenant" ON public.agents;
DROP POLICY IF EXISTS "Viewers can view agents in their tenant" ON public.agents;
DROP POLICY IF EXISTS "Agents can update their own record" ON public.agents;
DROP POLICY IF EXISTS "agents_select_policy" ON public.agents;
DROP POLICY IF EXISTS "agents_insert_policy" ON public.agents;
DROP POLICY IF EXISTS "agents_update_policy" ON public.agents;
DROP POLICY IF EXISTS "agents_delete_policy" ON public.agents;

CREATE POLICY "agents_select_multitenant" ON public.agents FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "agents_insert_multitenant" ON public.agents FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "agents_update_multitenant" ON public.agents FOR UPDATE
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "agents_delete_multitenant" ON public.agents FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 2. jobs - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can manage jobs in their tenant" ON public.jobs;
DROP POLICY IF EXISTS "Operators can manage jobs in their tenant" ON public.jobs;
DROP POLICY IF EXISTS "Viewers can view jobs in their tenant" ON public.jobs;
DROP POLICY IF EXISTS "jobs_select_policy" ON public.jobs;
DROP POLICY IF EXISTS "jobs_insert_policy" ON public.jobs;
DROP POLICY IF EXISTS "jobs_update_policy" ON public.jobs;
DROP POLICY IF EXISTS "jobs_delete_policy" ON public.jobs;

CREATE POLICY "jobs_select_multitenant" ON public.jobs FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "jobs_insert_multitenant" ON public.jobs FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "jobs_update_multitenant" ON public.jobs FOR UPDATE
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "jobs_delete_multitenant" ON public.jobs FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 3. reports - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can manage reports in their tenant" ON public.reports;
DROP POLICY IF EXISTS "Operators can view reports in their tenant" ON public.reports;
DROP POLICY IF EXISTS "Viewers can view reports in their tenant" ON public.reports;
DROP POLICY IF EXISTS "reports_select_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_insert_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_update_policy" ON public.reports;
DROP POLICY IF EXISTS "reports_delete_policy" ON public.reports;

CREATE POLICY "reports_select_multitenant" ON public.reports FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "reports_insert_multitenant" ON public.reports FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "reports_update_multitenant" ON public.reports FOR UPDATE
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "reports_delete_multitenant" ON public.reports FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 4. virus_scans - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can manage virus scans" ON public.virus_scans;
DROP POLICY IF EXISTS "Operators can manage virus scans" ON public.virus_scans;
DROP POLICY IF EXISTS "Viewers can view virus scans" ON public.virus_scans;
DROP POLICY IF EXISTS "virus_scans_select_policy" ON public.virus_scans;
DROP POLICY IF EXISTS "virus_scans_insert_policy" ON public.virus_scans;
DROP POLICY IF EXISTS "virus_scans_update_policy" ON public.virus_scans;

CREATE POLICY "virus_scans_select_multitenant" ON public.virus_scans FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "virus_scans_insert_multitenant" ON public.virus_scans FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "virus_scans_update_multitenant" ON public.virus_scans FOR UPDATE
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 5. audit_logs - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can read audit logs in their tenant" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_select_policy" ON public.audit_logs;
DROP POLICY IF EXISTS "audit_logs_insert_policy" ON public.audit_logs;

CREATE POLICY "audit_logs_select_multitenant" ON public.audit_logs FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "audit_logs_insert_multitenant" ON public.audit_logs FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 6. agent_builds - Drop and recreate ALL policies  
-- =========================================================================
DROP POLICY IF EXISTS "Admins can view builds in their tenant" ON public.agent_builds;
DROP POLICY IF EXISTS "agent_builds_select_policy" ON public.agent_builds;
DROP POLICY IF EXISTS "agent_builds_insert_policy" ON public.agent_builds;

CREATE POLICY "agent_builds_select_multitenant" ON public.agent_builds FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "agent_builds_insert_multitenant" ON public.agent_builds FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 7. agent_tokens - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can view tokens in their tenant" ON public.agent_tokens;
DROP POLICY IF EXISTS "agent_tokens_select_policy" ON public.agent_tokens;

CREATE POLICY "agent_tokens_select_multitenant" ON public.agent_tokens FOR SELECT
USING (
  public.is_super_admin(auth.uid())
  OR EXISTS (
    SELECT 1 FROM public.agents a 
    WHERE a.id = agent_tokens.agent_id 
    AND public.user_has_tenant_access(a.tenant_id)
  )
);

-- =========================================================================
-- 8. api_keys - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage their tenant api keys" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_select_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_insert_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_update_policy" ON public.api_keys;
DROP POLICY IF EXISTS "api_keys_delete_policy" ON public.api_keys;

CREATE POLICY "api_keys_select_multitenant" ON public.api_keys FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "api_keys_insert_multitenant" ON public.api_keys FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "api_keys_update_multitenant" ON public.api_keys FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "api_keys_delete_multitenant" ON public.api_keys FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 9. api_request_logs - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their tenant api request logs" ON public.api_request_logs;
DROP POLICY IF EXISTS "api_request_logs_select_policy" ON public.api_request_logs;

CREATE POLICY "api_request_logs_select_multitenant" ON public.api_request_logs FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 10. enrollment_keys - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can manage enrollment keys" ON public.enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_select_policy" ON public.enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_insert_policy" ON public.enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_update_policy" ON public.enrollment_keys;
DROP POLICY IF EXISTS "enrollment_keys_delete_policy" ON public.enrollment_keys;

CREATE POLICY "enrollment_keys_select_multitenant" ON public.enrollment_keys FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "enrollment_keys_insert_multitenant" ON public.enrollment_keys FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "enrollment_keys_update_multitenant" ON public.enrollment_keys FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "enrollment_keys_delete_multitenant" ON public.enrollment_keys FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 11. failed_login_attempts - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can view failed login attempts in their tenant" ON public.failed_login_attempts;
DROP POLICY IF EXISTS "failed_login_attempts_select_policy" ON public.failed_login_attempts;

CREATE POLICY "failed_login_attempts_select_multitenant" ON public.failed_login_attempts FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 12. invites - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Admins can manage invites in their tenant" ON public.invites;
DROP POLICY IF EXISTS "invites_select_policy" ON public.invites;
DROP POLICY IF EXISTS "invites_insert_policy" ON public.invites;
DROP POLICY IF EXISTS "invites_update_policy" ON public.invites;
DROP POLICY IF EXISTS "invites_delete_policy" ON public.invites;

CREATE POLICY "invites_select_multitenant" ON public.invites FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "invites_insert_multitenant" ON public.invites FOR INSERT
WITH CHECK (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "invites_update_multitenant" ON public.invites FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "invites_delete_multitenant" ON public.invites FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 13. quarantined_files - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can manage quarantined files in their tenant" ON public.quarantined_files;
DROP POLICY IF EXISTS "quarantined_files_select_policy" ON public.quarantined_files;
DROP POLICY IF EXISTS "quarantined_files_insert_policy" ON public.quarantined_files;
DROP POLICY IF EXISTS "quarantined_files_update_policy" ON public.quarantined_files;
DROP POLICY IF EXISTS "quarantined_files_delete_policy" ON public.quarantined_files;

CREATE POLICY "quarantined_files_select_multitenant" ON public.quarantined_files FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "quarantined_files_insert_multitenant" ON public.quarantined_files FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "quarantined_files_update_multitenant" ON public.quarantined_files FOR UPDATE
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "quarantined_files_delete_multitenant" ON public.quarantined_files FOR DELETE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 14. security_logs - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can view security logs in their tenant" ON public.security_logs;
DROP POLICY IF EXISTS "security_logs_select_policy" ON public.security_logs;
DROP POLICY IF EXISTS "security_logs_insert_policy" ON public.security_logs;

CREATE POLICY "security_logs_select_multitenant" ON public.security_logs FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "security_logs_insert_multitenant" ON public.security_logs FOR INSERT
WITH CHECK (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 15. tenant_features - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their tenant features" ON public.tenant_features;
DROP POLICY IF EXISTS "tenant_features_select_policy" ON public.tenant_features;

CREATE POLICY "tenant_features_select_multitenant" ON public.tenant_features FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 16. tenant_settings - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their tenant settings" ON public.tenant_settings;
DROP POLICY IF EXISTS "Admins can update their tenant settings" ON public.tenant_settings;
DROP POLICY IF EXISTS "tenant_settings_select_policy" ON public.tenant_settings;
DROP POLICY IF EXISTS "tenant_settings_update_policy" ON public.tenant_settings;

CREATE POLICY "tenant_settings_select_multitenant" ON public.tenant_settings FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

CREATE POLICY "tenant_settings_update_multitenant" ON public.tenant_settings FOR UPDATE
USING (
  (public.has_role(auth.uid(), 'admin') AND public.user_has_tenant_access(tenant_id))
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 17. tenant_subscriptions - Drop and recreate ALL policies
-- =========================================================================
DROP POLICY IF EXISTS "Users can view their tenant subscriptions" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "tenant_subscriptions_select_policy" ON public.tenant_subscriptions;

CREATE POLICY "tenant_subscriptions_select_multitenant" ON public.tenant_subscriptions FOR SELECT
USING (
  public.user_has_tenant_access(tenant_id)
  OR public.is_super_admin(auth.uid())
);

-- =========================================================================
-- 18. user_roles - Needs special handling (avoid recursion)
-- =========================================================================
-- user_roles is tricky - we need to allow users to see their own roles
DROP POLICY IF EXISTS "Users can view their own roles" ON public.user_roles;
DROP POLICY IF EXISTS "user_roles_select_policy" ON public.user_roles;

CREATE POLICY "user_roles_select_own" ON public.user_roles FOR SELECT
USING (
  user_id = auth.uid()
  OR public.is_super_admin(auth.uid())
);
