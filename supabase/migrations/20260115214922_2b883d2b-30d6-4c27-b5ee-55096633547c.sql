-- =============================================================================
-- Dr. Vellum Audit Fix: CRITICAL Security Hardening
-- Fixes CRIT-001, CRIT-002, HIGH-003, MED-003
-- =============================================================================

-- =============================================================================
-- CRIT-002: Fix SECURITY DEFINER functions - Add tenant verification
-- =============================================================================

-- Fix apply_agent_throttle: Add tenant ownership check
CREATE OR REPLACE FUNCTION public.apply_agent_throttle(
  p_agent_id UUID,
  p_poll_interval_seconds INTEGER DEFAULT 300,
  p_reason TEXT DEFAULT 'Automated throttle due to high request rate'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY: Verify agent belongs to caller's tenant (or caller is super admin)
  IF NOT EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = p_agent_id
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Agent % does not belong to your tenant', p_agent_id;
  END IF;

  UPDATE public.agents
  SET 
    is_throttled = true,
    throttled_at = NOW(),
    throttle_reason = p_reason,
    poll_interval_seconds = p_poll_interval_seconds
  WHERE id = p_agent_id;
  
  RETURN FOUND;
END;
$$;

-- Fix apply_agent_isolation: Add tenant ownership check
CREATE OR REPLACE FUNCTION public.apply_agent_isolation(
  p_agent_id UUID,
  p_reason TEXT DEFAULT 'Automated isolation due to security threats'
)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY: Verify agent belongs to caller's tenant (or caller is super admin)
  IF NOT EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = p_agent_id
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Agent % does not belong to your tenant', p_agent_id;
  END IF;

  -- Isolate the agent
  UPDATE public.agents
  SET 
    is_isolated = true,
    isolated_at = NOW(),
    isolation_reason = p_reason
  WHERE id = p_agent_id;
  
  -- Cancel all pending jobs for this agent
  UPDATE public.jobs
  SET 
    status = 'cancelled',
    error_message = 'Cancelled: Agent isolated - ' || p_reason,
    completed_at = NOW()
  WHERE agent_id = p_agent_id
    AND status IN ('queued', 'delivered');
  
  RETURN FOUND;
END;
$$;

-- Fix remove_agent_isolation: Add tenant ownership check
CREATE OR REPLACE FUNCTION public.remove_agent_isolation(p_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY: Verify agent belongs to caller's tenant (or caller is super admin)
  IF NOT EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = p_agent_id
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Agent % does not belong to your tenant', p_agent_id;
  END IF;

  UPDATE public.agents
  SET 
    is_isolated = false,
    isolated_at = NULL,
    isolation_reason = NULL
  WHERE id = p_agent_id;
  
  RETURN FOUND;
END;
$$;

-- Fix remove_agent_throttle: Add tenant ownership check
CREATE OR REPLACE FUNCTION public.remove_agent_throttle(p_agent_id UUID)
RETURNS BOOLEAN
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  -- SECURITY: Verify agent belongs to caller's tenant (or caller is super admin)
  IF NOT EXISTS (
    SELECT 1 FROM public.agents a
    WHERE a.id = p_agent_id
    AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
  ) THEN
    RAISE EXCEPTION 'Unauthorized: Agent % does not belong to your tenant', p_agent_id;
  END IF;

  UPDATE public.agents
  SET 
    is_throttled = false,
    throttled_at = NULL,
    throttle_reason = NULL,
    poll_interval_seconds = 60
  WHERE id = p_agent_id;
  
  RETURN FOUND;
END;
$$;

-- =============================================================================
-- MED-003: Add WITH CHECK clauses to INSERT policies
-- =============================================================================

-- agent_archive_events: Add WITH CHECK
DROP POLICY IF EXISTS "agent_archive_events_insert_active_tenant" ON public.agent_archive_events;
CREATE POLICY "agent_archive_events_insert_active_tenant" ON public.agent_archive_events
  FOR INSERT TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM agents a 
      WHERE a.id = agent_archive_events.agent_id 
      AND (a.tenant_id = get_active_tenant_id() OR is_current_super_admin())
    )
  );

-- agent_groups: Ensure INSERT has WITH CHECK
DROP POLICY IF EXISTS "agent_groups_insert_active_tenant" ON public.agent_groups;
CREATE POLICY "agent_groups_insert_active_tenant" ON public.agent_groups
  FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- agent_recovery_authorizations: Ensure INSERT has WITH CHECK
DROP POLICY IF EXISTS "agent_recovery_authorizations_insert" ON public.agent_recovery_authorizations;
CREATE POLICY "agent_recovery_authorizations_insert" ON public.agent_recovery_authorizations
  FOR INSERT TO authenticated
  WITH CHECK ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- =============================================================================
-- HIGH-003: Migrate remaining public role policies to authenticated
-- For: agents, enrollment_keys, profiles base policies
-- =============================================================================

-- Check and update agents policies to use authenticated role
DROP POLICY IF EXISTS "agents_select_active_tenant" ON public.agents;
CREATE POLICY "agents_select_active_tenant" ON public.agents
  FOR SELECT TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- enrollment_keys: Ensure authenticated role
DROP POLICY IF EXISTS "enrollment_keys_select_active_tenant" ON public.enrollment_keys;
CREATE POLICY "enrollment_keys_select_active_tenant" ON public.enrollment_keys
  FOR SELECT TO authenticated
  USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- =============================================================================
-- Document intentional decisions
-- =============================================================================

COMMENT ON FUNCTION public.apply_agent_isolation IS 'SECURITY: Tenant-verified agent isolation. Requires caller to own the agent via tenant_id check. ADR-VELLUM-001.';
COMMENT ON FUNCTION public.apply_agent_throttle IS 'SECURITY: Tenant-verified agent throttling. Requires caller to own the agent via tenant_id check. ADR-VELLUM-001.';
COMMENT ON FUNCTION public.remove_agent_isolation IS 'SECURITY: Tenant-verified isolation removal. Requires caller to own the agent via tenant_id check. ADR-VELLUM-001.';
COMMENT ON FUNCTION public.remove_agent_throttle IS 'SECURITY: Tenant-verified throttle removal. Requires caller to own the agent via tenant_id check. ADR-VELLUM-001.';