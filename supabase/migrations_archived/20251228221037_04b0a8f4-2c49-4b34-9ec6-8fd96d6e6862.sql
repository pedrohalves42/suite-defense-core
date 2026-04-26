
-- =========================================================================
-- MIGRACAO FINAL: Remover TODAS as politicas restantes com current_user_tenant_id()
-- =========================================================================

-- 1. api_keys
DROP POLICY IF EXISTS "Admins can manage API keys in their tenant" ON public.api_keys;

-- 2. api_request_logs  
DROP POLICY IF EXISTS "Admins can read API logs in their tenant" ON public.api_request_logs;

-- 3. enrollment_keys
DROP POLICY IF EXISTS "Admins can manage enrollment keys in their tenant" ON public.enrollment_keys;
DROP POLICY IF EXISTS "Operators can view enrollment key metadata" ON public.enrollment_keys;

-- 4. failed_login_attempts
DROP POLICY IF EXISTS "Admins can view tenant failed login attempts" ON public.failed_login_attempts;

-- 5. jobs
DROP POLICY IF EXISTS "Viewers can read jobs in their tenant" ON public.jobs;

-- 6. quarantined_files
DROP POLICY IF EXISTS "Admins can manage quarantined files in their tenant" ON public.quarantined_files;
DROP POLICY IF EXISTS "Operators can view quarantined files in their tenant" ON public.quarantined_files;

-- 7. reports
DROP POLICY IF EXISTS "Operators and viewers can read reports in their tenant" ON public.reports;

-- 8. security_logs
DROP POLICY IF EXISTS "Admins can view security logs in their tenant" ON public.security_logs;

-- 9. tenant_features
DROP POLICY IF EXISTS "Admins can manage tenant features" ON public.tenant_features;

-- 10. tenant_settings
DROP POLICY IF EXISTS "Admins can manage settings in their tenant" ON public.tenant_settings;
DROP POLICY IF EXISTS "Operators and viewers can read settings in their tenant" ON public.tenant_settings;

-- 11. tenant_subscriptions
DROP POLICY IF EXISTS "Admins podem gerenciar assinatura do seu tenant" ON public.tenant_subscriptions;
DROP POLICY IF EXISTS "Admins podem ver assinatura do seu tenant" ON public.tenant_subscriptions;

-- 12. user_roles (drop old policies, keep user_roles_select_own)
DROP POLICY IF EXISTS "Admins can manage roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Admins can view all roles in their tenant" ON public.user_roles;
DROP POLICY IF EXISTS "Operators can view roles in their tenant" ON public.user_roles;

-- 13. virus_scans
DROP POLICY IF EXISTS "Admins can manage virus scans in their tenant" ON public.virus_scans;
DROP POLICY IF EXISTS "Operators and viewers can read virus scans in their tenant" ON public.virus_scans;

-- =========================================================================
-- Verificacao final
-- =========================================================================
-- As novas politicas multi-tenant ja foram criadas na migracao anterior
-- Agora todas usam user_has_tenant_access() em vez de current_user_tenant_id()
