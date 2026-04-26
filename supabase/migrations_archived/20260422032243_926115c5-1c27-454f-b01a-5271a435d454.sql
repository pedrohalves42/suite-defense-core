-- Harden failed_login_attempts: prevent authenticated users from suppressing brute-force evidence (OWASP A09: Security Logging Failures)
-- Drop permissive write policies that allow tenant users to insert/update/delete login attempt records
DROP POLICY IF EXISTS failed_login_attempts_insert_active_tenant_v206 ON public.failed_login_attempts;
DROP POLICY IF EXISTS failed_login_attempts_update_active_tenant_v206 ON public.failed_login_attempts;
DROP POLICY IF EXISTS failed_login_attempts_delete_active_tenant_v206 ON public.failed_login_attempts;

-- Add RESTRICTIVE policies that block ALL writes from authenticated/anon roles
-- Service role bypasses RLS entirely, so edge functions (login flow) continue working
CREATE POLICY failed_login_attempts_no_user_insert
  ON public.failed_login_attempts
  AS RESTRICTIVE
  FOR INSERT
  TO authenticated, anon
  WITH CHECK (false);

CREATE POLICY failed_login_attempts_no_user_update
  ON public.failed_login_attempts
  AS RESTRICTIVE
  FOR UPDATE
  TO authenticated, anon
  USING (false)
  WITH CHECK (false);

CREATE POLICY failed_login_attempts_no_user_delete
  ON public.failed_login_attempts
  AS RESTRICTIVE
  FOR DELETE
  TO authenticated, anon
  USING (false);