-- ============================================
-- Score Governance: Moving Average + Guardrails
-- ============================================

-- Add governance columns to system_audits
ALTER TABLE public.system_audits 
ADD COLUMN IF NOT EXISTS raw_score INTEGER,
ADD COLUMN IF NOT EXISTS official_score INTEGER,
ADD COLUMN IF NOT EXISTS market_score INTEGER,
ADD COLUMN IF NOT EXISTS guardrail_applied BOOLEAN DEFAULT false,
ADD COLUMN IF NOT EXISTS guardrail_reason TEXT,
ADD COLUMN IF NOT EXISTS deterministic_base_score INTEGER,
ADD COLUMN IF NOT EXISTS red_risk_factor NUMERIC(4,3);

-- Comment for documentation
COMMENT ON COLUMN public.system_audits.raw_score IS 'Original score from AI before guardrails';
COMMENT ON COLUMN public.system_audits.official_score IS 'Weighted moving average score (50% current + 30% avg3 + 20% avg7)';
COMMENT ON COLUMN public.system_audits.market_score IS 'Conservative score for investors/market (more stable)';
COMMENT ON COLUMN public.system_audits.guardrail_applied IS 'Whether variation guardrail was applied (max ?10 pts)';
COMMENT ON COLUMN public.system_audits.guardrail_reason IS 'Reason for guardrail application';
COMMENT ON COLUMN public.system_audits.deterministic_base_score IS 'Score calculated from fixed rules (no LLM variance)';
COMMENT ON COLUMN public.system_audits.red_risk_factor IS 'Risk multiplier from Red Team (0.7-1.0)';

-- Add binary criteria columns to red_team_assessments
ALTER TABLE public.red_team_assessments
ADD COLUMN IF NOT EXISTS binary_criteria JSONB DEFAULT '{}'::jsonb,
ADD COLUMN IF NOT EXISTS criteria_count_true INTEGER DEFAULT 0;

COMMENT ON COLUMN public.red_team_assessments.binary_criteria IS 'Structured binary criteria for deterministic threat_level';
COMMENT ON COLUMN public.red_team_assessments.criteria_count_true IS 'Count of TRUE criteria for threat_level calculation';

-- Create view for moving average calculation
CREATE OR REPLACE VIEW public.v_audit_moving_average AS
SELECT 
  id,
  tenant_id,
  overall_score as current_score,
  raw_score,
  official_score,
  market_score,
  guardrail_applied,
  AVG(overall_score) OVER (
    PARTITION BY tenant_id 
    ORDER BY created_at 
    ROWS BETWEEN 2 PRECEDING AND CURRENT ROW
  ) as avg_last_3,
  AVG(overall_score) OVER (
    PARTITION BY tenant_id 
    ORDER BY created_at 
    ROWS BETWEEN 6 PRECEDING AND CURRENT ROW
  ) as avg_last_7,
  ROUND(
    0.5 * overall_score + 
    0.3 * COALESCE(AVG(overall_score) OVER (PARTITION BY tenant_id ORDER BY created_at ROWS BETWEEN 2 PRECEDING AND CURRENT ROW), overall_score) +
    0.2 * COALESCE(AVG(overall_score) OVER (PARTITION BY tenant_id ORDER BY created_at ROWS BETWEEN 6 PRECEDING AND CURRENT ROW), overall_score)
  )::integer as calculated_official_score,
  created_at
FROM public.system_audits
ORDER BY created_at DESC;

-- Grant access to the view
GRANT SELECT ON public.v_audit_moving_average TO authenticated;

-- Create function to get previous audit score
CREATE OR REPLACE FUNCTION public.get_previous_audit_score(p_tenant_id UUID)
RETURNS TABLE(
  previous_score INTEGER,
  previous_official_score INTEGER,
  avg_last_3 NUMERIC,
  avg_last_7 NUMERIC
) 
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  WITH recent_audits AS (
    SELECT 
      overall_score,
      official_score,
      created_at,
      ROW_NUMBER() OVER (ORDER BY created_at DESC) as rn
    FROM system_audits
    WHERE tenant_id = p_tenant_id
    ORDER BY created_at DESC
    LIMIT 7
  ),
  averages AS (
    SELECT 
      AVG(overall_score) FILTER (WHERE rn <= 3) as avg_3,
      AVG(overall_score) FILTER (WHERE rn <= 7) as avg_7
    FROM recent_audits
  )
  SELECT 
    ra.overall_score::INTEGER as previous_score,
    ra.official_score::INTEGER as previous_official_score,
    COALESCE(a.avg_3, ra.overall_score::NUMERIC) as avg_last_3,
    COALESCE(a.avg_7, ra.overall_score::NUMERIC) as avg_last_7
  FROM recent_audits ra
  CROSS JOIN averages a
  WHERE ra.rn = 1
  LIMIT 1;
END;
$$;