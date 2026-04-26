-- =====================================================
-- PRIORITY 1: Job Reliability Infrastructure
-- =====================================================

-- 1. Create scheduled_job_runs table for job observability
CREATE TABLE public.scheduled_job_runs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  job_name TEXT NOT NULL,
  ran_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  duration_ms INTEGER,
  success BOOLEAN NOT NULL DEFAULT false,
  error TEXT,
  result JSONB,
  processed_count INTEGER DEFAULT 0,
  tenant_id UUID REFERENCES public.tenants(id),
  created_at TIMESTAMPTZ DEFAULT now()
);

-- Indexes for performance
CREATE INDEX idx_scheduled_job_runs_job_name ON public.scheduled_job_runs(job_name);
CREATE INDEX idx_scheduled_job_runs_ran_at ON public.scheduled_job_runs(ran_at DESC);
CREATE INDEX idx_scheduled_job_runs_success ON public.scheduled_job_runs(success) WHERE NOT success;
CREATE INDEX idx_scheduled_job_runs_tenant ON public.scheduled_job_runs(tenant_id) WHERE tenant_id IS NOT NULL;

-- Enable RLS
ALTER TABLE public.scheduled_job_runs ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Super admins can view all job runs"
  ON public.scheduled_job_runs FOR SELECT
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() AND role = 'super_admin'
    )
  );

CREATE POLICY "Admins can view their tenant job runs"
  ON public.scheduled_job_runs FOR SELECT
  USING (
    tenant_id IS NULL OR
    EXISTS (
      SELECT 1 FROM public.user_roles 
      WHERE user_id = auth.uid() 
        AND tenant_id = scheduled_job_runs.tenant_id
        AND role IN ('admin', 'super_admin')
    )
  );

-- 2. Create view for job health monitoring
CREATE OR REPLACE VIEW public.v_job_health AS
WITH job_stats AS (
  SELECT 
    job_name,
    MAX(ran_at) as last_run,
    MAX(CASE WHEN success THEN ran_at END) as last_success,
    COUNT(*) FILTER (WHERE NOT success AND ran_at > NOW() - INTERVAL '24 hours') as failure_count_24h,
    COUNT(*) FILTER (WHERE ran_at > NOW() - INTERVAL '24 hours') as total_runs_24h,
    AVG(duration_ms) FILTER (WHERE ran_at > NOW() - INTERVAL '24 hours') as avg_duration_ms,
    MAX(duration_ms) FILTER (WHERE ran_at > NOW() - INTERVAL '24 hours') as max_duration_ms
  FROM public.scheduled_job_runs
  GROUP BY job_name
)
SELECT 
  js.job_name,
  js.last_run,
  js.last_success,
  js.failure_count_24h,
  js.total_runs_24h,
  ROUND(js.avg_duration_ms::numeric, 2) as avg_duration_ms,
  js.max_duration_ms,
  CASE 
    WHEN js.last_run IS NULL THEN 'never_ran'
    WHEN js.failure_count_24h > 3 THEN 'failing'
    WHEN js.failure_count_24h > 0 AND js.total_runs_24h > 0 
         AND (js.failure_count_24h::float / js.total_runs_24h::float) > 0.5 THEN 'degraded'
    WHEN js.last_run < NOW() - INTERVAL '2 hours' THEN 'stale'
    ELSE 'healthy'
  END as health_status,
  CASE 
    WHEN js.failure_count_24h > 3 THEN 'critical'
    WHEN js.failure_count_24h > 0 THEN 'warning'
    WHEN js.last_run < NOW() - INTERVAL '2 hours' THEN 'warning'
    ELSE 'ok'
  END as severity
FROM job_stats js;

-- 3. Add auto_action_mode to tenants for automation control
ALTER TABLE public.tenants ADD COLUMN IF NOT EXISTS auto_action_mode TEXT 
  DEFAULT 'suggest' 
  CHECK (auto_action_mode IN ('off', 'suggest', 'auto_low', 'auto_all'));

COMMENT ON COLUMN public.tenants.auto_action_mode IS 
  'Controls automation level: off=no auto, suggest=only suggestions, auto_low=auto low risk, auto_all=auto all without approval';

-- 4. Create function to log job execution
CREATE OR REPLACE FUNCTION public.log_scheduled_job_run(
  p_job_name TEXT,
  p_success BOOLEAN,
  p_duration_ms INTEGER DEFAULT NULL,
  p_error TEXT DEFAULT NULL,
  p_result JSONB DEFAULT NULL,
  p_processed_count INTEGER DEFAULT 0,
  p_tenant_id UUID DEFAULT NULL
)
RETURNS UUID
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_id UUID;
BEGIN
  INSERT INTO public.scheduled_job_runs (
    job_name, success, duration_ms, error, result, processed_count, tenant_id
  ) VALUES (
    p_job_name, p_success, p_duration_ms, p_error, p_result, p_processed_count, p_tenant_id
  )
  RETURNING id INTO v_id;
  
  RETURN v_id;
END;
$$;

-- 5. Create function to get job health summary
CREATE OR REPLACE FUNCTION public.get_job_health_summary()
RETURNS TABLE (
  total_jobs BIGINT,
  healthy_jobs BIGINT,
  failing_jobs BIGINT,
  stale_jobs BIGINT,
  never_ran_jobs BIGINT,
  avg_success_rate NUMERIC
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path TO 'public'
AS $$
  SELECT 
    COUNT(*) as total_jobs,
    COUNT(*) FILTER (WHERE health_status = 'healthy') as healthy_jobs,
    COUNT(*) FILTER (WHERE health_status = 'failing') as failing_jobs,
    COUNT(*) FILTER (WHERE health_status = 'stale') as stale_jobs,
    COUNT(*) FILTER (WHERE health_status = 'never_ran') as never_ran_jobs,
    ROUND(
      AVG(CASE 
        WHEN total_runs_24h > 0 
        THEN ((total_runs_24h - failure_count_24h)::float / total_runs_24h::float) * 100 
        ELSE 0 
      END)::numeric, 
      2
    ) as avg_success_rate
  FROM public.v_job_health;
$$;