-- Secure ai_insights: Ensure users only see their own tenant's data
DROP POLICY IF EXISTS "Users can view insights for their tenant" ON public.ai_insights;
CREATE POLICY "Users can view insights for their tenant" 
ON public.ai_insights 
FOR SELECT 
TO authenticated 
USING (tenant_id IN (
    SELECT id FROM public.tenants -- This assumes tenant table has its own RLS
));

-- Ensure ai_actions also has strict isolation
DROP POLICY IF EXISTS "Users can view actions for their tenant" ON public.ai_actions;
CREATE POLICY "Users can view actions for their tenant" 
ON public.ai_actions 
FOR SELECT 
TO authenticated 
USING (tenant_id IN (
    SELECT id FROM public.tenants
));
