
-- Fix v_service_role_policies to use security_invoker
DROP VIEW IF EXISTS v_service_role_policies;

CREATE VIEW v_service_role_policies 
WITH (security_invoker = on)
AS
SELECT 
  tablename,
  policyname,
  cmd as operation,
  'service_role' as granted_to,
  'INTENTIONAL: Backend automation via Edge Functions' as justification,
  'LOW' as risk_level
FROM pg_policies
WHERE schemaname = 'public'
  AND roles::text = '{service_role}'
  AND (qual::text = 'true' OR with_check::text = 'true')
ORDER BY tablename;

COMMENT ON VIEW v_service_role_policies IS 
'Audit view: Lists all service_role policies with USING(true)/WITH CHECK(true).
These are INTENTIONAL for backend automation and documented per ADR-023.
Risk: LOW - service_role key is only accessible to Edge Functions.
SECURITY: Uses security_invoker=on for proper RLS inheritance.';
