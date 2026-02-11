
-- Drop and recreate enrollment_keys_safe with correct columns
DROP VIEW IF EXISTS public.enrollment_keys_safe;

CREATE VIEW public.enrollment_keys_safe
WITH (security_invoker = on, security_barrier = true)
AS
SELECT 
  id,
  tenant_id,
  CASE 
    WHEN key IS NOT NULL AND length(key) > 8 
    THEN substring(key from 1 for 4) || '-****-' || substring(key from length(key) - 3 for 4)
    ELSE '****'
  END AS key_masked,
  description,
  max_uses,
  current_uses,
  is_active,
  created_at,
  expires_at,
  created_by,
  used_at,
  agent_id,
  used_by_agent
FROM enrollment_keys
WHERE auth.uid() IS NOT NULL 
  AND (tenant_id = get_active_tenant_id() OR is_current_super_admin());

REVOKE ALL ON public.enrollment_keys_safe FROM anon;
GRANT SELECT ON public.enrollment_keys_safe TO authenticated;
