-- ============================================================================
-- SSA-SEC: Remediate 6 Security Scanner Findings
-- Revoke public/anon access, restrict to authenticated users only
-- ============================================================================

-- 1. profiles table - ensure RLS is enabled and properly configured
ALTER TABLE public.profiles ENABLE ROW LEVEL SECURITY;

-- Revoke anon access
REVOKE ALL ON public.profiles FROM anon;
REVOKE ALL ON public.profiles FROM public;

-- Grant only to authenticated
GRANT SELECT ON public.profiles TO authenticated;
GRANT SELECT, INSERT, UPDATE ON public.profiles TO authenticated;

-- 2. agents_public view - revoke anon access
REVOKE ALL ON public.agents_public FROM anon;
REVOKE ALL ON public.agents_public FROM public;
GRANT SELECT ON public.agents_public TO authenticated;
GRANT SELECT ON public.agents_public TO service_role;

-- 3. agent_releases_public view - revoke anon access
REVOKE ALL ON public.agent_releases_public FROM anon;
REVOKE ALL ON public.agent_releases_public FROM public;
GRANT SELECT ON public.agent_releases_public TO authenticated;
GRANT SELECT ON public.agent_releases_public TO service_role;

-- 4. invites_safe view - revoke anon access
REVOKE ALL ON public.invites_safe FROM anon;
REVOKE ALL ON public.invites_safe FROM public;
GRANT SELECT ON public.invites_safe TO authenticated;
GRANT SELECT ON public.invites_safe TO service_role;

-- 5. enrollment_keys_safe view - revoke anon access
REVOKE ALL ON public.enrollment_keys_safe FROM anon;
REVOKE ALL ON public.enrollment_keys_safe FROM public;
GRANT SELECT ON public.enrollment_keys_safe TO authenticated;
GRANT SELECT ON public.enrollment_keys_safe TO service_role;

-- 6. profiles_public view - revoke anon access and add security
REVOKE ALL ON public.profiles_public FROM anon;
REVOKE ALL ON public.profiles_public FROM public;
GRANT SELECT ON public.profiles_public TO authenticated;
GRANT SELECT ON public.profiles_public TO service_role;

-- ============================================================================
-- Add comments documenting security model
-- ============================================================================
COMMENT ON VIEW public.agents_public IS 'Security: Requires authenticated role. Uses security_invoker=on for RLS enforcement.';
COMMENT ON VIEW public.agent_releases_public IS 'Security: Requires authenticated role. Public release metadata only.';
COMMENT ON VIEW public.invites_safe IS 'Security: Requires authenticated role. Tenant-isolated via RLS.';
COMMENT ON VIEW public.enrollment_keys_safe IS 'Security: Requires authenticated role. Tenant-isolated via RLS.';
COMMENT ON VIEW public.profiles_public IS 'Security: Requires authenticated role. Safe subset of profile data.';