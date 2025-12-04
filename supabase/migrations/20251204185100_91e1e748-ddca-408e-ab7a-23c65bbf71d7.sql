-- Dead-Letter Queue table for failed jobs
CREATE TABLE public.failed_jobs_dlq (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  original_job_id UUID NOT NULL,
  tenant_id UUID REFERENCES public.tenants(id) ON DELETE CASCADE,
  agent_id UUID REFERENCES public.agents(id) ON DELETE SET NULL,
  agent_name TEXT NOT NULL,
  job_type TEXT NOT NULL,
  payload JSONB,
  error_message TEXT,
  error_count INTEGER DEFAULT 1,
  first_failure_at TIMESTAMPTZ DEFAULT NOW(),
  last_failure_at TIMESTAMPTZ DEFAULT NOW(),
  retry_count INTEGER DEFAULT 0,
  max_retries INTEGER DEFAULT 3,
  next_retry_at TIMESTAMPTZ,
  status TEXT DEFAULT 'pending' CHECK (status IN ('pending', 'retrying', 'exhausted', 'resolved')),
  resolution_notes TEXT,
  resolved_at TIMESTAMPTZ,
  resolved_by UUID,
  metadata JSONB DEFAULT '{}'::jsonb,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

-- Enable RLS
ALTER TABLE public.failed_jobs_dlq ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view tenant DLQ" ON public.failed_jobs_dlq
  FOR SELECT USING (
    tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admins can update tenant DLQ" ON public.failed_jobs_dlq
  FOR UPDATE USING (
    tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Admins can delete from tenant DLQ" ON public.failed_jobs_dlq
  FOR DELETE USING (
    tenant_id IN (SELECT tenant_id FROM public.user_roles WHERE user_id = auth.uid() AND role IN ('admin', 'super_admin'))
  );

CREATE POLICY "Service role can manage DLQ" ON public.failed_jobs_dlq
  FOR ALL USING (auth.role() = 'service_role');

-- Indexes for performance
CREATE INDEX idx_dlq_tenant_status ON public.failed_jobs_dlq(tenant_id, status);
CREATE INDEX idx_dlq_next_retry ON public.failed_jobs_dlq(next_retry_at) WHERE status = 'pending';
CREATE INDEX idx_dlq_original_job ON public.failed_jobs_dlq(original_job_id);
CREATE INDEX idx_dlq_created_at ON public.failed_jobs_dlq(created_at DESC);

-- Rate limiting stats view
CREATE OR REPLACE VIEW public.rate_limit_stats AS
SELECT 
  endpoint,
  identifier,
  request_count,
  window_start,
  blocked_until,
  CASE WHEN blocked_until > NOW() THEN true ELSE false END as is_blocked
FROM public.rate_limits
WHERE window_start > NOW() - INTERVAL '24 hours';

-- Function to get rate limit summary
CREATE OR REPLACE FUNCTION public.get_rate_limit_summary(p_hours_back INTEGER DEFAULT 24)
RETURNS TABLE(
  endpoint TEXT,
  total_requests BIGINT,
  unique_identifiers BIGINT,
  blocked_count BIGINT,
  avg_requests_per_identifier NUMERIC
)
LANGUAGE plpgsql
SECURITY INVOKER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT 
    rl.endpoint,
    SUM(rl.request_count)::BIGINT as total_requests,
    COUNT(DISTINCT rl.identifier)::BIGINT as unique_identifiers,
    COUNT(*) FILTER (WHERE rl.blocked_until > NOW())::BIGINT as blocked_count,
    ROUND(AVG(rl.request_count), 2) as avg_requests_per_identifier
  FROM public.rate_limits rl
  WHERE rl.window_start > NOW() - (p_hours_back || ' hours')::INTERVAL
  GROUP BY rl.endpoint
  ORDER BY total_requests DESC;
END;
$$;