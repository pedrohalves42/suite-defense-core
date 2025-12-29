-- Add new columns to system_audits for evidence-based reporting
ALTER TABLE public.system_audits 
ADD COLUMN IF NOT EXISTS evidence_basis JSONB DEFAULT '[]'::jsonb,
ADD COLUMN IF NOT EXISTS falsification_criteria JSONB DEFAULT '[]'::jsonb;

-- Comment on new columns
COMMENT ON COLUMN public.system_audits.evidence_basis IS 'Array of evidence objects with claim, type (direct_evidence|observed_metric|controlled_inference), source, confidence';
COMMENT ON COLUMN public.system_audits.falsification_criteria IS 'Array of conditions that would invalidate or reduce the audit score';

-- Create Red Team assessments table
CREATE TABLE public.red_team_assessments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Core assessment
  threat_level TEXT NOT NULL CHECK (threat_level IN ('low', 'medium', 'high', 'critical')),
  red_score INTEGER NOT NULL CHECK (red_score >= 0 AND red_score <= 100),
  
  -- Attack vectors identified
  attack_vectors JSONB NOT NULL DEFAULT '[]'::jsonb,
  residual_risks JSONB NOT NULL DEFAULT '[]'::jsonb,
  
  -- Dimension-specific threats (0-10 scale, higher = more risk)
  threat_system_identity INTEGER CHECK (threat_system_identity >= 0 AND threat_system_identity <= 10),
  threat_governance INTEGER CHECK (threat_governance >= 0 AND threat_governance <= 10),
  threat_evidence_proof INTEGER CHECK (threat_evidence_proof >= 0 AND threat_evidence_proof <= 10),
  threat_human_oversight INTEGER CHECK (threat_human_oversight >= 0 AND threat_human_oversight <= 10),
  threat_operational_resilience INTEGER CHECK (threat_operational_resilience >= 0 AND threat_operational_resilience <= 10),
  threat_cross_tenant_isolation INTEGER CHECK (threat_cross_tenant_isolation >= 0 AND threat_cross_tenant_isolation <= 10),
  threat_transparency_explainability INTEGER CHECK (threat_transparency_explainability >= 0 AND threat_transparency_explainability <= 10),
  threat_compliance_alignment INTEGER CHECK (threat_compliance_alignment >= 0 AND threat_compliance_alignment <= 10),
  threat_market_trust INTEGER CHECK (threat_market_trust >= 0 AND threat_market_trust <= 10),
  
  -- Red Team analysis
  executive_threat_summary TEXT,
  worst_case_scenario TEXT,
  recommended_hardening JSONB DEFAULT '[]'::jsonb,
  
  -- AI metadata
  ai_model TEXT,
  ai_prompt_hash TEXT,
  ai_response_raw JSONB,
  
  -- Metrics snapshot at time of assessment
  metrics_snapshot JSONB,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for efficient querying
CREATE INDEX idx_red_team_tenant_created ON public.red_team_assessments(tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.red_team_assessments ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view red team assessments for their tenant"
  ON public.red_team_assessments
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = red_team_assessments.tenant_id
        AND ur.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert red team assessments"
  ON public.red_team_assessments
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = red_team_assessments.tenant_id
        AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Create Confidence Gap tracking table
CREATE TABLE public.audit_confidence_gaps (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id UUID NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  
  -- Link to source assessments
  audit_id UUID REFERENCES public.system_audits(id) ON DELETE SET NULL,
  red_team_id UUID REFERENCES public.red_team_assessments(id) ON DELETE SET NULL,
  
  -- Scores
  ana_score INTEGER NOT NULL CHECK (ana_score >= 0 AND ana_score <= 100),
  red_score INTEGER NOT NULL CHECK (red_score >= 0 AND red_score <= 100),
  confidence_gap INTEGER NOT NULL, -- ana_score - red_score
  
  -- Health status derived from gap
  health_status TEXT NOT NULL CHECK (health_status IN ('healthy', 'attention', 'critical')),
  
  -- Gap change tracking
  previous_gap INTEGER,
  gap_delta INTEGER, -- current gap - previous gap
  
  -- Alert flags
  alert_triggered BOOLEAN DEFAULT false,
  alert_reason TEXT,
  
  -- Dimension-specific gaps
  dimension_gaps JSONB DEFAULT '{}'::jsonb,
  
  -- Timestamps
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Create index for trend analysis
CREATE INDEX idx_confidence_gap_tenant_created ON public.audit_confidence_gaps(tenant_id, created_at DESC);

-- Enable RLS
ALTER TABLE public.audit_confidence_gaps ENABLE ROW LEVEL SECURITY;

-- RLS Policies
CREATE POLICY "Admins can view confidence gaps for their tenant"
  ON public.audit_confidence_gaps
  FOR SELECT
  TO authenticated
  USING (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = audit_confidence_gaps.tenant_id
        AND ur.role IN ('admin', 'super_admin')
    )
  );

CREATE POLICY "System can insert confidence gaps"
  ON public.audit_confidence_gaps
  FOR INSERT
  TO authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.user_roles ur
      WHERE ur.user_id = auth.uid()
        AND ur.tenant_id = audit_confidence_gaps.tenant_id
        AND ur.role IN ('admin', 'super_admin')
    )
  );

-- Create view for confidence gap trend analysis
CREATE OR REPLACE VIEW public.v_confidence_gap_trend AS
SELECT 
  cg.tenant_id,
  cg.id,
  cg.created_at,
  cg.ana_score,
  cg.red_score,
  cg.confidence_gap,
  cg.health_status,
  cg.gap_delta,
  cg.alert_triggered,
  -- Calculate 30-day trend
  AVG(cg.confidence_gap) OVER (
    PARTITION BY cg.tenant_id 
    ORDER BY cg.created_at 
    ROWS BETWEEN 30 PRECEDING AND CURRENT ROW
  ) AS avg_gap_30d,
  -- Calculate if trending down
  cg.confidence_gap - LAG(cg.confidence_gap, 1) OVER (
    PARTITION BY cg.tenant_id 
    ORDER BY cg.created_at
  ) AS gap_change,
  -- Count consecutive decreases
  CASE 
    WHEN cg.confidence_gap < LAG(cg.confidence_gap, 1) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at)
     AND LAG(cg.confidence_gap, 1) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at) < 
         LAG(cg.confidence_gap, 2) OVER (PARTITION BY cg.tenant_id ORDER BY cg.created_at)
    THEN true
    ELSE false
  END AS consecutive_decrease
FROM public.audit_confidence_gaps cg;

-- Function to calculate and insert confidence gap
CREATE OR REPLACE FUNCTION public.calculate_confidence_gap(
  p_tenant_id UUID,
  p_audit_id UUID,
  p_red_team_id UUID,
  p_ana_score INTEGER,
  p_red_score INTEGER,
  p_dimension_gaps JSONB DEFAULT '{}'::jsonb
)
RETURNS public.audit_confidence_gaps
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  v_gap INTEGER;
  v_health TEXT;
  v_previous_gap INTEGER;
  v_gap_delta INTEGER;
  v_alert_triggered BOOLEAN := false;
  v_alert_reason TEXT;
  v_result public.audit_confidence_gaps;
BEGIN
  -- Calculate gap
  v_gap := p_ana_score - p_red_score;
  
  -- Determine health status
  IF v_gap > 40 THEN
    v_health := 'healthy';
  ELSIF v_gap >= 20 THEN
    v_health := 'attention';
  ELSE
    v_health := 'critical';
  END IF;
  
  -- Get previous gap for this tenant
  SELECT confidence_gap INTO v_previous_gap
  FROM public.audit_confidence_gaps
  WHERE tenant_id = p_tenant_id
  ORDER BY created_at DESC
  LIMIT 1;
  
  -- Calculate delta if we have previous data
  IF v_previous_gap IS NOT NULL THEN
    v_gap_delta := v_gap - v_previous_gap;
    
    -- Trigger alert if gap dropped more than 15 points
    IF v_gap_delta < -15 THEN
      v_alert_triggered := true;
      v_alert_reason := format('Confidence gap dropped %s points (from %s to %s)', 
        ABS(v_gap_delta), v_previous_gap, v_gap);
    END IF;
  END IF;
  
  -- Also alert on critical status
  IF v_health = 'critical' AND NOT v_alert_triggered THEN
    v_alert_triggered := true;
    v_alert_reason := format('Confidence gap entered critical zone: %s', v_gap);
  END IF;
  
  -- Insert the record
  INSERT INTO public.audit_confidence_gaps (
    tenant_id, audit_id, red_team_id,
    ana_score, red_score, confidence_gap,
    health_status, previous_gap, gap_delta,
    alert_triggered, alert_reason, dimension_gaps
  ) VALUES (
    p_tenant_id, p_audit_id, p_red_team_id,
    p_ana_score, p_red_score, v_gap,
    v_health, v_previous_gap, v_gap_delta,
    v_alert_triggered, v_alert_reason, p_dimension_gaps
  )
  RETURNING * INTO v_result;
  
  RETURN v_result;
END;
$$;