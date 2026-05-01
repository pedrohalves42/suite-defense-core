-- 1. Fix AI Insights Exposure (A01)
DROP POLICY IF EXISTS "Users can view insights for their tenant" ON public.ai_insights;

CREATE POLICY "ai_insights_select_tenant_scoped" 
ON public.ai_insights 
FOR SELECT 
USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid OR is_current_super_admin());

-- 2. Fix Agent Telemetry Exposure (A02 & A05)
ALTER TABLE public.agent_system_metrics_2026_06 ENABLE ROW LEVEL SECURITY;

CREATE POLICY "agent_system_metrics_2026_06_tenant_scoped" 
ON public.agent_system_metrics_2026_06 
FOR SELECT 
USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid OR is_current_super_admin());

-- 3. Fix Privilege Escalation (A03)
DROP POLICY IF EXISTS "user_roles_insert_active_tenant" ON public.user_roles;

CREATE POLICY "user_roles_insert_restricted" 
ON public.user_roles 
FOR INSERT 
WITH CHECK (
  is_current_super_admin() 
  OR 
  (
    tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
    AND 
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
      AND tenant_id = (auth.jwt() ->> 'tenant_id')::uuid 
      AND role = 'admin'
    )
    AND 
    role != 'super_admin' -- Corrected: new.role -> role
  )
);

-- Update existing policies to ensure they use auth.uid() or is_current_super_admin() correctly
ALTER POLICY "user_roles_select_active_tenant" ON public.user_roles 
USING (tenant_id = (auth.jwt() ->> 'tenant_id')::uuid OR user_id = auth.uid() OR is_current_super_admin());

-- 4. Storage Security (A04)
-- We need to drop the public policies on storage.objects that affect the 'agent-scripts' bucket
DROP POLICY IF EXISTS "Agent scripts are publicly readable" ON storage.objects;
DROP POLICY IF EXISTS "Agents can read scripts by path" ON storage.objects;

-- Create restricted policy for agent-scripts
CREATE POLICY "Authenticated users can read agent scripts" 
ON storage.objects 
FOR SELECT 
TO authenticated 
USING (bucket_id = 'agent-scripts');

-- 5. Function Security (A06, A07)
-- Revoke public execution
REVOKE EXECUTE ON FUNCTION public.is_current_super_admin() FROM PUBLIC;
REVOKE EXECUTE ON FUNCTION public.invalidate_cache_prefix(text) FROM PUBLIC;

-- Re-grant to authenticated (safe because logic checks inside)
GRANT EXECUTE ON FUNCTION public.is_current_super_admin() TO authenticated;
