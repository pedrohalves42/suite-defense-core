-- Fix: Restrict INSERT to service_role only (not anon)
DROP POLICY IF EXISTS "Service role can insert compliance snapshots" ON public.compliance_snapshots;

-- Revoke anon access entirely
REVOKE ALL ON public.compliance_snapshots FROM anon;

-- Service role bypasses RLS, so no INSERT policy needed for it.
-- Only authenticated users with correct tenant can SELECT.
