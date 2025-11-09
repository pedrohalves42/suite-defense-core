-- Corrigir view agents_safe - remover SECURITY DEFINER implícito
DROP VIEW IF EXISTS public.agents_safe CASCADE;

CREATE VIEW public.agents_safe 
WITH (security_invoker = true) AS
SELECT 
  id,
  agent_name,
  tenant_id,
  enrolled_at,
  last_heartbeat,
  status,
  payload_hash
FROM public.agents;

GRANT SELECT ON public.agents_safe TO authenticated;