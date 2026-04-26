-- ADR-026 Final Artifacts: Tenant Claim Health Monitoring View
-- Provides metrics for monitoring JWT claim health and tenant switches

CREATE VIEW public.v_tenant_claim_health
WITH (security_invoker = on) AS
SELECT
  date_trunc('hour', created_at) as period,
  COUNT(*) FILTER (WHERE 
    details->>'active_tenant_id' IS NOT NULL 
    AND details->>'active_tenant_id' != ''
  ) as valid_claims,
  COUNT(*) FILTER (WHERE 
    details->>'active_tenant_id' IS NULL 
    OR details->>'active_tenant_id' = ''
  ) as missing_claims,
  COUNT(*) FILTER (WHERE action = 'tenant_switch') as tenant_switches,
  COUNT(*) FILTER (WHERE 
    action = 'update_user_role' 
    AND success = false
  ) as cross_tenant_attempts
FROM public.audit_logs
WHERE created_at > NOW() - INTERVAL '7 days'
GROUP BY 1
ORDER BY 1 DESC;

COMMENT ON VIEW public.v_tenant_claim_health IS 'ADR-026: Metrics for monitoring JWT claim health and tenant isolation. Used by Security Dashboard.';

-- Add index to audit_logs for better performance on action filtering
CREATE INDEX IF NOT EXISTS idx_audit_logs_action_created 
ON public.audit_logs(action, created_at DESC);

CREATE INDEX IF NOT EXISTS idx_audit_logs_success_created 
ON public.audit_logs(success, created_at DESC);