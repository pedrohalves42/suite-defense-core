-- V-004: Fix security_logs DELETE policy for anonymous users
-- The current RLS allows anonymous DELETE which violates audit integrity

-- Drop any existing delete policies for anon
DROP POLICY IF EXISTS "security_logs_no_delete" ON security_logs;

-- Create restrictive DELETE policy - only service_role can delete (for maintenance)
CREATE POLICY "security_logs_no_delete_for_users" 
ON security_logs 
FOR DELETE 
TO authenticated, anon
USING (false);

-- Note: The trigger tr_prevent_security_logs_modification already blocks DELETE,
-- but RLS should also deny it at the policy level for defense-in-depth