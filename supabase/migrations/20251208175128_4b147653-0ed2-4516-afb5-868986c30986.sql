
-- SEC-01: Fix permissive RLS policy on agent_builds
-- The current policy allows ANY user to update ANY build record
-- This should be restricted to service_role only (for Edge Functions)

-- Drop the permissive policy
DROP POLICY IF EXISTS "System can update builds" ON public.agent_builds;

-- Create restrictive policy - only service_role can update builds
CREATE POLICY "Service role can update builds" 
ON public.agent_builds 
FOR UPDATE 
TO service_role
USING (true)
WITH CHECK (true);

-- Also ensure INSERT is properly restricted to service_role
DROP POLICY IF EXISTS "Admins can create builds" ON public.agent_builds;

CREATE POLICY "Service role can create builds" 
ON public.agent_builds 
FOR INSERT 
TO service_role
WITH CHECK (true);

-- Add comment for documentation
COMMENT ON TABLE public.agent_builds IS 'Agent build records - managed exclusively by Edge Functions (service_role). Admins can only view builds in their tenant.';
