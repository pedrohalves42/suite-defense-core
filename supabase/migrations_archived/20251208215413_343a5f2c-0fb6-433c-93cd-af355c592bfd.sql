-- P0 CRITICAL FIX: Secure agent_system_metrics_unified view
-- Issue: View exposes 3,547+ metrics records to anonymous users without authentication
-- Fix: Recreate with security_invoker=on and tenant filtering

DROP VIEW IF EXISTS public.agent_system_metrics_unified;

CREATE VIEW public.agent_system_metrics_unified
WITH (security_invoker=on) AS
SELECT asm.* 
FROM agent_system_metrics asm
WHERE asm.tenant_id IN (
  SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
)
UNION ALL
SELECT asmp.*
FROM agent_system_metrics_partitioned asmp
WHERE asmp.collected_at >= CURRENT_DATE - INTERVAL '90 days'
  AND asmp.tenant_id IN (
    SELECT tenant_id FROM user_roles WHERE user_id = auth.uid()
  );