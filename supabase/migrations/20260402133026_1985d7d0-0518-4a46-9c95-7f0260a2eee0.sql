
-- honeypot_rate_limits is service_role only.
-- Add a deny-all policy for authenticated to satisfy the linter.
CREATE POLICY "deny_authenticated_honeypot_rate_limits"
  ON public.honeypot_rate_limits
  FOR ALL
  TO authenticated
  USING (false);
