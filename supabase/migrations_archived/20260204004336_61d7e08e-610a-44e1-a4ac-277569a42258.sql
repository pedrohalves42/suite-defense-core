-- V-004b: Remove permissive DELETE policy that conflicts with restrictive policy
-- The security_logs table should be append-only (INSERT/SELECT only for users)

-- Drop the permissive delete policy that allows tenant-scoped deletes
DROP POLICY IF EXISTS "security_logs_delete_active_tenant" ON security_logs;

-- The restrictive policy "security_logs_no_delete_for_users" already blocks DELETE
-- Now only service_role can delete (for emergency maintenance)

-- Also add trigger protection as defense-in-depth
-- (Already exists from previous migration: tr_prevent_security_logs_modification)