-- ADR-026 Final Hardening: Add security_invoker=on to invites_safe
-- This is the LAST remaining view requiring hardening

DROP VIEW IF EXISTS invites_safe;
CREATE VIEW invites_safe
WITH (security_invoker = on) AS
SELECT 
  id,
  tenant_id,
  email,
  role,
  status,
  invited_by,
  created_at,
  expires_at,
  accepted_at
  -- Excluding: token (sensitive column)
FROM invites;

GRANT SELECT ON invites_safe TO authenticated;