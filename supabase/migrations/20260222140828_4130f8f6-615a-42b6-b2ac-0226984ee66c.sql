
-- Step 1: C1 - Add SELECT policies for authenticated role

-- agent_groups: add authenticated SELECT (public already has one)
CREATE POLICY "agent_groups_select_authenticated"
ON public.agent_groups
FOR SELECT
TO authenticated
USING ((tenant_id = get_active_tenant_id()) OR is_current_super_admin());

-- rate_limits: add authenticated SELECT
CREATE POLICY "rate_limits_select_authenticated"
ON public.rate_limits
FOR SELECT
TO authenticated
USING (true);
