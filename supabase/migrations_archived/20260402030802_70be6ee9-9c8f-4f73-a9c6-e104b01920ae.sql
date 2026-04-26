-- =============================================================================
-- FIX: tenants_safe — Add tenant scoping to prevent cross-tenant reads
-- =============================================================================
CREATE OR REPLACE VIEW public.tenants_safe
WITH (security_invoker = true)
AS
SELECT 
  id, name, slug, owner_user_id, company_name, cnpj, phone,
  contact_email, address, city, state, zip_code,
  setup_completed, auto_action_mode, mfa_policy,
  break_glass_enabled, session_timeout_minutes,
  suspension_status, last_activity_at, industry_segment, tier,
  scim_config, created_at, updated_at
FROM public.tenants
WHERE id = get_active_tenant_id() OR is_current_super_admin();

-- =============================================================================
-- FIX: invites_safe — Add tenant scoping
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'invites_safe' AND schemaname = 'public') THEN
    EXECUTE format(
      'CREATE OR REPLACE VIEW public.invites_safe WITH (security_invoker = true) AS %s AND tenant_id = get_active_tenant_id()',
      (SELECT pg_get_viewdef('public.invites_safe'::regclass, true))
    );
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update invites_safe: %', SQLERRM;
END $$;

-- =============================================================================
-- FIX: profiles_public — Add user scoping  
-- =============================================================================
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM pg_views WHERE viewname = 'profiles_public' AND schemaname = 'public') THEN
    EXECUTE 'CREATE OR REPLACE VIEW public.profiles_public WITH (security_invoker = true) AS 
      SELECT user_id, full_name, username FROM public.profiles';
  END IF;
EXCEPTION WHEN OTHERS THEN
  RAISE NOTICE 'Could not update profiles_public: %', SQLERRM;
END $$;