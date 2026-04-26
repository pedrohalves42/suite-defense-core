
-- Human-in-the-loop enforcement for critical AI actions

-- 1. Add column to tenant_settings for per-tenant control
ALTER TABLE public.tenant_settings 
ADD COLUMN IF NOT EXISTS force_human_review_critical boolean NOT NULL DEFAULT true;

COMMENT ON COLUMN public.tenant_settings.force_human_review_critical IS 
'When true, ALL critical-severity AI actions require human approval regardless of policy engine decisions.';

-- 2. Create a view for pending critical approvals (used by dashboard)
CREATE OR REPLACE VIEW public.v_pending_critical_approvals 
WITH (security_invoker = on, security_barrier = true) AS
SELECT 
  ar.id,
  ar.tenant_id,
  ar.action_type,
  ar.action_payload,
  ar.status,
  ar.required_approvers,
  ar.current_approvers,
  ar.expires_at,
  ar.created_at,
  ar.playbook_execution_id,
  pe.playbook_snapshot->>'name' as playbook_name,
  pe.playbook_snapshot->>'severity' as severity,
  pe.risk_score,
  pe.dry_run,
  pe.trigger_source,
  a.agent_name,
  a.hostname
FROM approval_requests ar
LEFT JOIN playbook_executions pe ON pe.id = ar.playbook_execution_id
LEFT JOIN agents a ON a.id = ar.target_agent_id
WHERE ar.status = 'pending'
  AND ar.expires_at > now()
  AND (ar.tenant_id = get_active_tenant_id() OR is_current_super_admin());

COMMENT ON VIEW public.v_pending_critical_approvals IS 
'Human-in-the-loop: Pending approval requests requiring human review. Filtered by tenant.';

-- 3. Create RPC to check if an action requires human review
CREATE OR REPLACE FUNCTION public.requires_human_review(
  p_tenant_id uuid,
  p_severity text,
  p_action_type text DEFAULT NULL
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  v_tenant_setting boolean;
  v_critical_severities text[] := ARRAY['critical', 'high'];
BEGIN
  -- Check tenant-level setting
  SELECT force_human_review_critical INTO v_tenant_setting
  FROM tenant_settings
  WHERE tenant_id = p_tenant_id;
  
  -- Default to true if no tenant setting exists
  v_tenant_setting := COALESCE(v_tenant_setting, true);
  
  -- If tenant has it enabled and severity is critical/high, require review
  IF v_tenant_setting AND p_severity = ANY(v_critical_severities) THEN
    RETURN true;
  END IF;
  
  RETURN false;
END;
$$;

-- Secure the RPC
REVOKE ALL ON FUNCTION public.requires_human_review FROM public, anon;
GRANT EXECUTE ON FUNCTION public.requires_human_review TO authenticated, service_role;
