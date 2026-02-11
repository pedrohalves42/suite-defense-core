
-- =============================================================================
-- SSA-SEC-006: Revoke anon access from security-sensitive views and tables
-- Fixes 5 errors + 1 warning from security scan
-- =============================================================================

-- 1. audit_logs_safe - Revoke anon, grant only authenticated
REVOKE ALL ON public.audit_logs_safe FROM anon;
GRANT SELECT ON public.audit_logs_safe TO authenticated;

-- 2. agent_releases_public - Revoke anon, grant only authenticated
REVOKE ALL ON public.agent_releases_public FROM anon;
GRANT SELECT ON public.agent_releases_public TO authenticated;

-- 3. invites_safe - Revoke anon, grant only authenticated
REVOKE ALL ON public.invites_safe FROM anon;
GRANT SELECT ON public.invites_safe TO authenticated;

-- 4. agents_safe - Revoke anon, grant only authenticated
REVOKE ALL ON public.agents_safe FROM anon;
GRANT SELECT ON public.agents_safe TO authenticated;

-- 5. enrollment_keys_safe - Revoke anon, grant only authenticated
REVOKE ALL ON public.enrollment_keys_safe FROM anon;
GRANT SELECT ON public.enrollment_keys_safe TO authenticated;

-- 6. agent_archive_events - Ensure RLS is enabled and tenant-isolated
ALTER TABLE public.agent_archive_events ENABLE ROW LEVEL SECURITY;

-- Drop existing policies if any to avoid conflicts
DO $$ BEGIN
  DROP POLICY IF EXISTS "Tenant users can view own archive events" ON public.agent_archive_events;
  DROP POLICY IF EXISTS "Service role full access to archive events" ON public.agent_archive_events;
EXCEPTION WHEN OTHERS THEN NULL;
END $$;

-- Tenant-isolated SELECT policy
CREATE POLICY "Tenant users can view own archive events"
ON public.agent_archive_events
FOR SELECT
TO authenticated
USING (
  EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = agent_archive_events.agent_id
    AND a.tenant_id = (SELECT get_active_tenant_id())
  )
  OR is_current_super_admin()
);

-- Service role full access for backend operations
CREATE POLICY "Service role full access to archive events"
ON public.agent_archive_events
FOR ALL
TO service_role
USING (true)
WITH CHECK (true);

-- Revoke anon from agent_archive_events too
REVOKE ALL ON public.agent_archive_events FROM anon;
GRANT SELECT ON public.agent_archive_events TO authenticated;
