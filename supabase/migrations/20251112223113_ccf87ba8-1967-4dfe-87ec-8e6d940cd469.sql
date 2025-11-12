-- Create performance_metrics table for APM
CREATE TABLE IF NOT EXISTS public.performance_metrics (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  function_name TEXT NOT NULL,
  operation_type TEXT NOT NULL, -- 'edge_function', 'database_query', 'external_api'
  duration_ms INTEGER NOT NULL,
  status_code INTEGER,
  error_message TEXT,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT now() NOT NULL
);

-- Add indexes for performance
CREATE INDEX idx_performance_metrics_tenant_id ON public.performance_metrics(tenant_id);
CREATE INDEX idx_performance_metrics_function_name ON public.performance_metrics(function_name);
CREATE INDEX idx_performance_metrics_created_at ON public.performance_metrics(created_at DESC);
CREATE INDEX idx_performance_metrics_duration ON public.performance_metrics(duration_ms DESC);

-- Enable RLS
ALTER TABLE public.performance_metrics ENABLE ROW LEVEL SECURITY;

-- Admins can view their tenant's metrics
CREATE POLICY "Admins can view tenant metrics"
ON public.performance_metrics
FOR SELECT
USING (
  tenant_id IN (
    SELECT tenant_id FROM public.user_roles 
    WHERE user_id = auth.uid() AND role = 'admin'
  )
);

-- System can insert metrics (used by Edge Functions)
CREATE POLICY "System can insert metrics"
ON public.performance_metrics
FOR INSERT
WITH CHECK (true);

-- Auto-cleanup old metrics (>90 days)
CREATE OR REPLACE FUNCTION public.cleanup_old_performance_metrics()
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
BEGIN
  DELETE FROM public.performance_metrics
  WHERE created_at < NOW() - INTERVAL '90 days';
  
  RAISE NOTICE 'Limpeza de métricas antigas concluída em %', NOW();
END;
$function$;

COMMENT ON TABLE public.performance_metrics IS 'APM table for tracking Edge Function and operation performance';
COMMENT ON COLUMN public.performance_metrics.duration_ms IS 'Operation duration in milliseconds';
COMMENT ON COLUMN public.performance_metrics.operation_type IS 'Type: edge_function, database_query, external_api';
COMMENT ON COLUMN public.performance_metrics.metadata IS 'Additional context: user_id, request_id, endpoint, etc.';