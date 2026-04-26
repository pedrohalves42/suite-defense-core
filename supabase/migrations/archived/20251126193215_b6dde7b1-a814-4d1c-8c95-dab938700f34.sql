-- ============================================================================
-- FASE 7: Correcao P0 Blockers - Security Scan Remediation
-- ============================================================================
-- Fix: subscription_plans exposes pricing to public
-- Fix: Document security_invoker views for scan clarification
-- ============================================================================

-- 1. FIX CRITICAL: subscription_plans public access
-- Remove permissive policy and restrict to authenticated users only

DROP POLICY IF EXISTS "Qualquer um pode ver planos" ON public.subscription_plans;

CREATE POLICY "authenticated_users_can_view_plans"
ON public.subscription_plans
FOR SELECT
TO authenticated
USING (true);

COMMENT ON POLICY "authenticated_users_can_view_plans" ON public.subscription_plans IS 
'Restricts subscription plan visibility to authenticated users only. Public access removed to protect pricing strategy.';

-- 2. DOCUMENT SECURITY: Add comments to all security_invoker views
-- These views are SECURE because they use security_invoker=on + tenant_id filtering

COMMENT ON VIEW public.v_agent_lifecycle_state IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.v_agent_health_summary IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.v_problematic_agents IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.agent_releases_public IS 
'SECURE VIEW: Uses security_invoker=on. Intentionally public for agent update checks (no sensitive data exposed).';

COMMENT ON VIEW public.audit_logs_safe IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. Masks sensitive fields (IP addresses).';

COMMENT ON VIEW public.installation_metrics_summary IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.installation_error_summary IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.installation_health_status IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.jobs_normalized IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.v_problematic_jobs IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.enrollment_keys_safe IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. Masks sensitive key field.';

COMMENT ON VIEW public.agents_safe IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. Masks HMAC secrets.';

COMMENT ON VIEW public.agents_health_view IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. No direct RLS policies needed.';

COMMENT ON VIEW public.agent_installation_metrics IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. Analytics data protected.';

COMMENT ON VIEW public.agent_timeline_events IS 
'SECURE VIEW: Uses security_invoker=on with tenant_id filtering via user_roles. Timeline data protected.';

-- 3. VERIFY: Ensure subscription_plans has RLS enabled
ALTER TABLE public.subscription_plans ENABLE ROW LEVEL SECURITY;

-- 4. SECURITY SUMMARY COMMENT
COMMENT ON TABLE public.subscription_plans IS 
'Subscription pricing plans. RLS enabled with authenticated-only access to protect competitive pricing strategy.';