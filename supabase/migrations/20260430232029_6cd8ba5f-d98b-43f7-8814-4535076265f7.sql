-- Harden get_active_tenant_id to be more explicit and safe
CREATE OR REPLACE FUNCTION public.get_active_tenant_id()
 RETURNS uuid
 LANGUAGE plpgsql
 STABLE SECURITY DEFINER
 SET search_path TO 'public'
AS $function$
DECLARE
  v_claim text;
  v_user_id uuid;
BEGIN
  -- Get the claim
  v_claim := current_setting('request.jwt.claims', true)::json->'app_metadata'->>'active_tenant_id';
  v_user_id := auth.uid();

  -- If no claim, we can't determine active tenant
  IF v_claim IS NULL OR v_claim = '' THEN
    RETURN NULL;
  END IF;

  -- Validate that the user actually belongs to this tenant
  -- This prevents a user from spoofing the active_tenant_id claim (if they could)
  IF EXISTS (
    SELECT 1 FROM public.user_roles 
    WHERE user_id = v_user_id AND tenant_id = v_claim::uuid
  ) OR public.is_current_super_admin() THEN
    RETURN v_claim::uuid;
  END IF;

  RETURN NULL;
END;
$function$;

-- Update AI Actions RLS to be more explicit
-- We ensure that SELECT, INSERT and UPDATE are strictly bound to the user's tenants
DROP POLICY IF EXISTS "ai_actions_select_tenant_isolation" ON public.ai_actions;
CREATE POLICY "ai_actions_select_tenant_isolation_v2" 
ON public.ai_actions 
FOR SELECT 
TO authenticated
USING (
  is_current_super_admin() OR 
  tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid())
);

DROP POLICY IF EXISTS "ai_actions_insert_tenant_isolation" ON public.ai_actions;
CREATE POLICY "ai_actions_insert_tenant_isolation_v2" 
ON public.ai_actions 
FOR INSERT 
TO authenticated
WITH CHECK (
  is_current_super_admin() OR 
  (tenant_id = get_active_tenant_id() AND 
   tenant_id IN (SELECT ur.tenant_id FROM user_roles ur WHERE ur.user_id = auth.uid()))
);

-- Fix Linter warnings for SECURITY DEFINER functions
-- Revoke public execute from sensitive functions and grant to authenticated
REVOKE EXECUTE ON FUNCTION public.log_security_violation(uuid, uuid, text, text, text, text, jsonb) FROM public;
REVOKE EXECUTE ON FUNCTION public.log_security_violation(uuid, uuid, text, text, text, text, jsonb) FROM anon;
GRANT EXECUTE ON FUNCTION public.log_security_violation(uuid, uuid, text, text, text, text, jsonb) TO authenticated;
GRANT EXECUTE ON FUNCTION public.log_security_violation(uuid, uuid, text, text, text, text, jsonb) TO service_role;

REVOKE EXECUTE ON FUNCTION public.archive_agent(uuid) FROM public;
REVOKE EXECUTE ON FUNCTION public.archive_agent(uuid) FROM anon;
GRANT EXECUTE ON FUNCTION public.archive_agent(uuid) TO authenticated;

REVOKE EXECUTE ON FUNCTION public.invalidate_cache_prefix(text) FROM public;
REVOKE EXECUTE ON FUNCTION public.invalidate_cache_prefix(text) FROM anon;
GRANT EXECUTE ON FUNCTION public.invalidate_cache_prefix(text) TO authenticated;

-- Ensure ai_actions column protection logic is understood
-- While RLS is row-level, we add a comment to remind developers that these fields
-- are sensitive and should not be exposed in public-facing views without filtering.
COMMENT ON COLUMN public.ai_actions.reasoning_summary IS 'Sensitive AI reasoning, strictly isolated by tenant RLS.';
COMMENT ON COLUMN public.ai_actions.evidence_pack IS 'Sensitive evidence data, strictly isolated by tenant RLS.';
