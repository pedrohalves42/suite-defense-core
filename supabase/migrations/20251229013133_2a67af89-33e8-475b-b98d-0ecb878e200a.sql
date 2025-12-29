-- =====================================================
-- SOC 2 COMPLIANCE INFRASTRUCTURE
-- =====================================================

-- Table: soc2_criteria (CC1-CC9 Trust Services Criteria)
CREATE TABLE public.soc2_criteria (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  criteria_code text NOT NULL, -- CC1, CC2, etc.
  criteria_name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'implemented', 'verified')),
  implementation_notes text,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, criteria_code)
);

-- Table: soc2_controls (specific controls within each criteria)
CREATE TABLE public.soc2_controls (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  criteria_id uuid NOT NULL REFERENCES public.soc2_criteria(id) ON DELETE CASCADE,
  control_code text NOT NULL, -- CC1.1, CC1.2, etc.
  control_name text NOT NULL,
  description text,
  status text NOT NULL DEFAULT 'not_started' CHECK (status IN ('not_started', 'in_progress', 'implemented', 'verified')),
  evidence_type text, -- 'table', 'function', 'policy', 'document'
  evidence_ref text, -- reference to actual evidence (table name, function name, etc.)
  gap_notes text,
  remediation_plan text,
  owner text,
  due_date date,
  verified_at timestamptz,
  verified_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, control_code)
);

-- Table: compliance_policies (formal policy documents)
CREATE TABLE public.compliance_policies (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  policy_code text NOT NULL, -- ISP-001, ACP-001, etc.
  policy_name text NOT NULL,
  version text NOT NULL DEFAULT '1.0',
  status text NOT NULL DEFAULT 'draft' CHECK (status IN ('draft', 'review', 'approved', 'deprecated')),
  content_hash text, -- SHA256 of content for integrity
  owner text,
  approved_by uuid,
  approved_at timestamptz,
  effective_date date,
  review_date date,
  soc2_criteria text[], -- array of criteria codes this policy covers
  file_path text, -- path to markdown file
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, policy_code)
);

-- Table: vendor_risk_registry (third-party risk management)
CREATE TABLE public.vendor_risk_registry (
  id uuid NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  tenant_id uuid NOT NULL REFERENCES public.tenants(id) ON DELETE CASCADE,
  vendor_name text NOT NULL,
  vendor_type text NOT NULL, -- 'cloud', 'payment', 'email', 'database', 'other'
  criticality text NOT NULL DEFAULT 'medium' CHECK (criticality IN ('low', 'medium', 'high', 'critical')),
  services_provided text[],
  data_shared text[], -- types of data shared with vendor
  compliance_certifications text[], -- SOC2, ISO27001, PCI-DSS, etc.
  contract_start_date date,
  contract_end_date date,
  last_review_date date,
  next_review_date date,
  risk_score integer CHECK (risk_score >= 0 AND risk_score <= 100),
  risk_notes text,
  status text NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'pending_review', 'suspended', 'terminated')),
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(tenant_id, vendor_name)
);

-- Enable RLS
ALTER TABLE public.soc2_criteria ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.soc2_controls ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.compliance_policies ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.vendor_risk_registry ENABLE ROW LEVEL SECURITY;

-- RLS Policies for soc2_criteria
CREATE POLICY "soc2_criteria_select_tenant" ON public.soc2_criteria
  FOR SELECT USING (user_has_tenant_access(tenant_id) OR is_super_admin(auth.uid()));

CREATE POLICY "soc2_criteria_insert_admin" ON public.soc2_criteria
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "soc2_criteria_update_admin" ON public.soc2_criteria
  FOR UPDATE USING (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

-- RLS Policies for soc2_controls
CREATE POLICY "soc2_controls_select_tenant" ON public.soc2_controls
  FOR SELECT USING (user_has_tenant_access(tenant_id) OR is_super_admin(auth.uid()));

CREATE POLICY "soc2_controls_insert_admin" ON public.soc2_controls
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "soc2_controls_update_admin" ON public.soc2_controls
  FOR UPDATE USING (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

-- RLS Policies for compliance_policies
CREATE POLICY "compliance_policies_select_tenant" ON public.compliance_policies
  FOR SELECT USING (user_has_tenant_access(tenant_id) OR is_super_admin(auth.uid()));

CREATE POLICY "compliance_policies_insert_admin" ON public.compliance_policies
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "compliance_policies_update_admin" ON public.compliance_policies
  FOR UPDATE USING (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

-- RLS Policies for vendor_risk_registry
CREATE POLICY "vendor_risk_select_tenant" ON public.vendor_risk_registry
  FOR SELECT USING (user_has_tenant_access(tenant_id) OR is_super_admin(auth.uid()));

CREATE POLICY "vendor_risk_insert_admin" ON public.vendor_risk_registry
  FOR INSERT WITH CHECK (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

CREATE POLICY "vendor_risk_update_admin" ON public.vendor_risk_registry
  FOR UPDATE USING (
    (has_role(auth.uid(), 'admin'::app_role) AND user_has_tenant_access(tenant_id))
    OR is_super_admin(auth.uid())
  );

-- View: v_soc2_readiness (automatic readiness score calculation)
CREATE OR REPLACE VIEW public.v_soc2_readiness AS
SELECT 
  sc.tenant_id,
  sc.criteria_code,
  sc.criteria_name,
  sc.status AS criteria_status,
  COUNT(ctrl.id) AS total_controls,
  COUNT(CASE WHEN ctrl.status = 'verified' THEN 1 END) AS verified_controls,
  COUNT(CASE WHEN ctrl.status = 'implemented' THEN 1 END) AS implemented_controls,
  COUNT(CASE WHEN ctrl.status = 'in_progress' THEN 1 END) AS in_progress_controls,
  COUNT(CASE WHEN ctrl.status = 'not_started' THEN 1 END) AS not_started_controls,
  CASE 
    WHEN COUNT(ctrl.id) = 0 THEN 0
    ELSE ROUND(
      (COUNT(CASE WHEN ctrl.status = 'verified' THEN 1 END)::numeric * 100 +
       COUNT(CASE WHEN ctrl.status = 'implemented' THEN 1 END)::numeric * 75 +
       COUNT(CASE WHEN ctrl.status = 'in_progress' THEN 1 END)::numeric * 25) / 
      COUNT(ctrl.id)::numeric
    )
  END AS criteria_readiness_score
FROM public.soc2_criteria sc
LEFT JOIN public.soc2_controls ctrl ON ctrl.criteria_id = sc.id
GROUP BY sc.tenant_id, sc.criteria_code, sc.criteria_name, sc.status;

-- Indexes for performance
CREATE INDEX idx_soc2_criteria_tenant ON public.soc2_criteria(tenant_id);
CREATE INDEX idx_soc2_controls_tenant ON public.soc2_controls(tenant_id);
CREATE INDEX idx_soc2_controls_criteria ON public.soc2_controls(criteria_id);
CREATE INDEX idx_compliance_policies_tenant ON public.compliance_policies(tenant_id);
CREATE INDEX idx_vendor_risk_tenant ON public.vendor_risk_registry(tenant_id);

-- Trigger for updated_at
CREATE TRIGGER update_soc2_criteria_updated_at
  BEFORE UPDATE ON public.soc2_criteria
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_soc2_controls_updated_at
  BEFORE UPDATE ON public.soc2_controls
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_compliance_policies_updated_at
  BEFORE UPDATE ON public.compliance_policies
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

CREATE TRIGGER update_vendor_risk_updated_at
  BEFORE UPDATE ON public.vendor_risk_registry
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();