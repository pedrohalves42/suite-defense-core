-- SEC-02: Restrict ai_learned_patterns policies to service_role only
-- These tables are managed exclusively by backend ML processes

-- Drop the overly permissive policy
DROP POLICY IF EXISTS "System can manage patterns" ON public.ai_learned_patterns;

-- Create restrictive policy for service_role only
CREATE POLICY "Service role can manage patterns"
ON public.ai_learned_patterns
FOR ALL
USING (auth.role() = 'service_role')
WITH CHECK (auth.role() = 'service_role');

-- Keep the existing SELECT policy for admins viewing patterns (already secure)
-- "Admins can view patterns for their tenant" is already tenant-isolated