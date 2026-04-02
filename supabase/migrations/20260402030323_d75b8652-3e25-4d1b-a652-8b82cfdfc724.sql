-- Add security_invoker to tenants_safe for defense in depth
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
FROM public.tenants;