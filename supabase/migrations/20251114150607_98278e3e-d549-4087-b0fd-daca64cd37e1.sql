-- Function to check installation failure rate
CREATE OR REPLACE FUNCTION public.check_installation_failure_rate(
  p_tenant_id UUID DEFAULT NULL,
  p_hours_back INTEGER DEFAULT 1,
  p_threshold_pct NUMERIC DEFAULT 30.0
)
RETURNS TABLE(
  tenant_id UUID,
  total_attempts BIGINT,
  failed_attempts BIGINT,
  failure_rate_pct NUMERIC,
  exceeds_threshold BOOLEAN,
  period_start TIMESTAMP WITH TIME ZONE,
  period_end TIMESTAMP WITH TIME ZONE
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = 'public'
AS $$
BEGIN
  RETURN QUERY
  WITH installation_stats AS (
    SELECT
      ia.tenant_id,
      COUNT(*) as total,
      COUNT(*) FILTER (WHERE ia.success = false) as failed,
      NOW() - (p_hours_back || ' hours')::INTERVAL as period_start,
      NOW() as period_end
    FROM public.installation_analytics ia
    WHERE ia.event_type IN ('post_installation', 'post_installation_unverified')
      AND ia.created_at > NOW() - (p_hours_back || ' hours')::INTERVAL
      AND (p_tenant_id IS NULL OR ia.tenant_id = p_tenant_id)
    GROUP BY ia.tenant_id
  )
  SELECT
    s.tenant_id,
    s.total::BIGINT as total_attempts,
    s.failed::BIGINT as failed_attempts,
    CASE 
      WHEN s.total > 0 THEN ROUND((s.failed::NUMERIC / s.total::NUMERIC) * 100, 1)
      ELSE 0
    END as failure_rate_pct,
    CASE 
      WHEN s.total > 0 AND (s.failed::NUMERIC / s.total::NUMERIC) * 100 > p_threshold_pct THEN true
      ELSE false
    END as exceeds_threshold,
    s.period_start,
    s.period_end
  FROM installation_stats s
  WHERE s.total >= 3; -- Minimum 3 attempts to trigger alert
END;
$$;