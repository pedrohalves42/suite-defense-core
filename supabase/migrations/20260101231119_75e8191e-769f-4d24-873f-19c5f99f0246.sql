-- Enable RLS on the metrics partition table
ALTER TABLE public.agent_system_metrics_2026_02 ENABLE ROW LEVEL SECURITY;

-- Create RLS policy for this partition (inherits from parent)
CREATE POLICY "Users can view their tenant metrics"
ON public.agent_system_metrics_2026_02 FOR SELECT
TO authenticated
USING (
  tenant_id IN (
    SELECT ur.tenant_id FROM public.user_roles ur WHERE ur.user_id = auth.uid()
  )
);